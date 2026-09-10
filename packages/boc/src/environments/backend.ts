import type {
  Action,
  Availability,
  CancelResult,
  Containers,
  OperationResult,
  Run,
  Stack,
  State,
} from "@opencode/schema/boc/environment"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { ProcessHost, ProcessObservation } from "./process"
import {
  checkReadiness,
  inspectContainers,
  inspectStack,
  preflight,
  resolveDevenv,
  runCommand,
  supportsGuardedRemoval,
  type CommandRunner,
  type ContainerInspection,
  type DevenvInstallation,
  type StackAssignment,
} from "./devenv"
import { createEnvironmentStore, type EnvironmentRecord, type EnvironmentRun } from "./store"

const LOG_LIMIT = 64 * 1024
const OWNER_FILE = "boc-environment-owner.json"

export type Checkout = {
  readonly directory: string
  readonly gitDirectory: string
}

export type CheckoutResult =
  | { readonly available: true; readonly checkout: Checkout }
  | { readonly available: false; readonly reason: Extract<Availability, { available: false }>["reason"] }

export type EnvironmentBackendOptions = {
  readonly enabled: boolean
  readonly stateDirectory: string
  readonly process: ProcessHost
  readonly checkout: (projectID: string, directory: string) => Promise<CheckoutResult>
  readonly installation?: () => Promise<DevenvInstallation | undefined>
  readonly command?: CommandRunner
  readonly readinessAttempts?: number
  readonly readinessDelayMs?: number
}

export interface EnvironmentBackend {
  readonly inspect: (projectID: string, directory: string) => Promise<State>
  readonly run: (input: {
    readonly projectID: string
    readonly directory: string
    readonly sessionID: string
    readonly action: Action
    readonly domain?: string
    readonly confirmation?: "remove-environment"
  }) => Promise<OperationResult>
  readonly cancel: (projectID: string, directory: string) => Promise<CancelResult>
}

type ActiveOperation = {
  cancelled: boolean
  completion: Promise<void>
  observation?: ProcessObservation
}

export function createEnvironmentBackend(options: EnvironmentBackendOptions): EnvironmentBackend {
  const store = createEnvironmentStore(options.stateDirectory)
  const command = options.command ?? runCommand
  const installation = options.installation ?? resolveDevenv
  const active = new Map<string, ActiveOperation>()
  const admissions = new Map<string, Promise<void>>()

  const serialize = <A>(key: string, operation: () => Promise<A>) => {
    const previous = admissions.get(key) ?? Promise.resolve()
    const result = previous.then(operation, operation)
    const settled = result.then(
      () => undefined,
      () => undefined,
    )
    admissions.set(key, settled)
    void settled.finally(() => {
      if (admissions.get(key) === settled) admissions.delete(key)
    })
    return result
  }

  const inspect = async (projectID: string, requestedDirectory: string): Promise<State> => {
    const directory = path.resolve(requestedDirectory)
    const record = await store.read(projectID, directory)
    if (!options.enabled) return unavailable(projectID, directory, record, "backend-unavailable")
    if (process.platform !== "darwin" && process.platform !== "linux") {
      return unavailable(projectID, directory, record, "unsupported-platform")
    }
    const checkout = await options.checkout(projectID, directory)
    if (!checkout.available) return unavailable(projectID, directory, record, checkout.reason)
    const devenv = await installation()
    if (!devenv) return unavailable(projectID, checkout.checkout.directory, record, "devenv-unavailable")
    const stack = await inspectStack(devenv, checkout.checkout.directory)
    const ownership = await owns(record, checkout.checkout)
    if (record && !ownership) {
      return unavailable(
        projectID,
        checkout.checkout.directory,
        record,
        "checkout-ownership-mismatch",
        stackState(stack),
      )
    }
    if (record?.latestRun?.status === "running" && !active.has(key(projectID, checkout.checkout.directory))) {
      await reconcile(record, checkout.checkout, devenv)
    }
    const latestRecord = await store.read(projectID, checkout.checkout.directory)
    const assignment = stack.status === "configured" ? stack.assignment : undefined
    if (
      latestRecord?.assignment &&
      !assignment &&
      stack.status === "unconfigured" &&
      latestRecord.latestRun?.action === "remove" &&
      latestRecord.latestRun.phase === 1 &&
      latestRecord.latestRun.status !== "running"
    ) {
      const containers = await inspectContainers(devenv, latestRecord.assignment, command)
      if (containers.owned && containers.total === 0) {
        const reconciled = {
          ...latestRecord,
          assignment: undefined,
          http: { status: "unknown" as const },
          latestRun:
            latestRecord.latestRun.status === "failed" && latestRecord.latestRun.exitCode === 0
              ? { ...latestRecord.latestRun, status: "succeeded" as const }
              : latestRecord.latestRun,
        }
        await store.write(reconciled)
        return state(
          projectID,
          checkout.checkout.directory,
          { available: true },
          { status: "unconfigured" },
          containers,
          reconciled,
        )
      }
    }
    if (latestRecord?.assignment && (!assignment || !sameAssignment(latestRecord.assignment, assignment))) {
      return unavailable(projectID, checkout.checkout.directory, latestRecord, "checkout-ownership-mismatch", {
        status: "invalid",
      })
    }
    const containers = assignment
      ? await inspectContainers(devenv, assignment, command)
      : { status: "absent" as const, total: 0, running: 0, owned: true }
    return state(
      projectID,
      checkout.checkout.directory,
      { available: true },
      stackState(stack),
      containers,
      latestRecord,
    )
  }

  const run: EnvironmentBackend["run"] = (input) =>
    serialize(key(input.projectID, path.resolve(input.directory)), async () => {
      let before = await inspect(input.projectID, input.directory)
      const environmentKey = key(before.projectID, before.directory)
      const previous = active.get(environmentKey)
      if (previous) {
        if (before.latestRun?.status === "running") return rejected("operation-running", before)
        await previous.completion
        before = await inspect(input.projectID, input.directory)
      }
      if (active.has(environmentKey)) return rejected("operation-running", before)
      if (!before.availability.available) return rejected("not-available", before)
      if (input.action === "remove" && input.confirmation !== "remove-environment") {
        return rejected("confirmation-required", before)
      }
      const checkout = await options.checkout(input.projectID, before.directory)
      if (!checkout.available) return rejected("not-available", before)
      const devenv = await installation()
      if (!devenv) return rejected("not-available", before)
      const currentStack = await inspectStack(devenv, checkout.checkout.directory)
      if (input.action !== "setup" && currentStack.status !== "configured") {
        return rejected("not-configured", before)
      }
      if (input.action === "remove" && !(await supportsGuardedRemoval(devenv, before.directory, command))) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "devenv-preflight-failed" },
        })
      }
      if (
        (input.action === "setup" || input.action === "start") &&
        !(await preflight(devenv, before.directory, input.action, command))
      ) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "devenv-preflight-failed" },
        })
      }
      const claimed = await claim(
        input.projectID,
        await store.read(input.projectID, checkout.checkout.directory),
        checkout.checkout,
        currentStack,
      )
      if (!claimed) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "checkout-ownership-mismatch" },
        })
      }
      const stack = currentStack.status === "configured" ? currentStack.assignment : undefined
      if (stack) {
        const containers = await inspectContainers(devenv, stack, command)
        if (!containers.owned) {
          return rejected("not-available", {
            ...before,
            stack: { status: "invalid" },
            containers: publicContainers(containers),
          })
        }
      }
      if (input.action === "remove" && !stack) return rejected("not-configured", before)
      const operation: ActiveOperation = { cancelled: false, completion: Promise.resolve() }
      active.set(environmentKey, operation)
      const record: EnvironmentRecord = {
        ...claimed,
        assignment: stack,
        latestRun: {
          id: randomUUID(),
          action: input.action,
          status: "running",
          startedAt: Date.now(),
          log: "",
          truncated: false,
          sessionID: input.sessionID,
          outputOffset: 0,
          phase: 0,
        },
      }
      await store.write(record)
      operation.completion = execute(record, checkout.checkout, devenv, operation, input.domain).finally(() =>
        release(operation, record),
      )
      void operation.completion
      return { accepted: true, environment: await inspect(input.projectID, checkout.checkout.directory) }
    })

  const cancel: EnvironmentBackend["cancel"] = (projectID, directory) =>
    serialize(key(projectID, path.resolve(directory)), async () => {
      const environment = await inspect(projectID, directory)
      const environmentKey = key(projectID, environment.directory)
      const operation = active.get(environmentKey)
      const record = await store.read(projectID, environment.directory)
      const ptyID = record?.latestRun?.status === "running" ? record.latestRun.ptyID : undefined
      if (!operation && !ptyID) return { cancelled: false, environment }
      if (operation) {
        operation.cancelled = true
        if (ptyID) await options.process.terminate(ptyID).catch(() => undefined)
        await operation.completion.catch(() => undefined)
      } else if (ptyID) {
        await options.process.terminate(ptyID).catch(() => undefined)
      }
      const latest = await store.read(projectID, environment.directory)
      if (latest?.latestRun?.status === "running") {
        await store.write({
          ...latest,
          latestRun: { ...latest.latestRun, status: "cancelled", endedAt: Date.now(), exitCode: 130 },
        })
      }
      return { cancelled: true, environment: await inspect(projectID, environment.directory) }
    })

  return { inspect, run, cancel }

  async function reconcile(record: EnvironmentRecord, checkout: Checkout, devenv: DevenvInstallation) {
    const latest = record.latestRun
    if (!latest?.ptyID) {
      await store.write({
        ...record,
        latestRun: latest ? { ...latest, status: "unknown", endedAt: Date.now() } : latest,
      })
      return
    }
    const environmentKey = key(record.projectID, record.directory)
    if (active.has(environmentKey)) return
    const process = await options.process.get(latest.ptyID).catch(() => undefined)
    if (!process) {
      await store.write({ ...record, latestRun: { ...latest, status: "unknown", endedAt: Date.now() } })
      return
    }
    const operation: ActiveOperation = { cancelled: false, completion: Promise.resolve() }
    active.set(environmentKey, operation)
    operation.completion = continueExecution(record, checkout, devenv, operation, latest.ptyID).finally(() =>
      release(operation, record),
    )
    void operation.completion
  }

  async function execute(
    record: EnvironmentRecord,
    checkout: Checkout,
    devenv: DevenvInstallation,
    operation: ActiveOperation,
    domain?: string,
  ) {
    const latest = record.latestRun
    if (!latest) return
    try {
      if (operation.cancelled || latest.status === "cancelled") return
      const spec = commandFor(devenv, checkout.directory, latest.action, latest.phase, record.assignment, domain)
      append(latest, `$ ${[spec.command, ...spec.args].join(" ")}\n`)
      const process = await options.process.create({
        groupID: environmentGroup(record.projectID, record.directory),
        ...spec,
        cwd: checkout.directory,
        title: `boc-environment-${latest.action}`,
        env: devenv.environment,
      })
      latest.ptyID = process.id
      await store.write(record)
      if (operation.cancelled) await options.process.terminate(process.id).catch(() => undefined)
      await continueExecution(record, checkout, devenv, operation, process.id, domain)
    } catch (error) {
      append(latest, `\n${error instanceof Error ? error.message : String(error)}\n`)
      latest.status = operation.cancelled ? "cancelled" : "failed"
      latest.endedAt = Date.now()
      await refresh(record, devenv)
      await store.write(record)
    }
  }

  async function continueExecution(
    record: EnvironmentRecord,
    checkout: Checkout,
    devenv: DevenvInstallation,
    operation: ActiveOperation,
    ptyID: string,
    domain?: string,
  ) {
    const latest = record.latestRun
    if (!latest) return
    const observation = await options.process.observe(ptyID, latest.outputOffset, (event) => {
      append(latest, Buffer.from(event.data).toString("utf8"))
      latest.outputOffset = event.end
    })
    operation.observation = observation
    if (observation.replay.byteLength) append(latest, Buffer.from(observation.replay).toString("utf8"))
    latest.outputOffset = observation.replayEnd
    if (observation.truncated) latest.truncated = true
    await store.write(record)
    const result = await observation.done
    operation.observation = undefined
    latest.outputOffset = result.finalOffset
    latest.exitCode = result.exitCode
    if (operation.cancelled || latest.status === "cancelled") {
      latest.status = "cancelled"
      latest.exitCode = 130
      latest.endedAt = Date.now()
      await refresh(record, devenv)
      await store.write(record)
      return
    }
    if (result.disconnected) {
      // Keep the durable run open. A replacement backend can reattach to the
      // daemon and decide whether the process is still running or was lost.
      await store.write(record)
      return
    }
    if (result.exitCode !== 0) {
      latest.status = "failed"
      latest.endedAt = Date.now()
      await refresh(record, devenv)
      await store.write(record)
      return
    }
    if (latest.action === "remove" && latest.phase === 0) {
      const stack = await inspectStack(devenv, checkout.directory)
      if (!record.assignment || stack.status !== "configured" || !sameAssignment(record.assignment, stack.assignment)) {
        throw new Error("The environment assignment changed after devenv down.")
      }
      const containers = await inspectContainers(devenv, stack.assignment, command)
      if (!containers.owned || containers.total !== 0)
        throw new Error("The environment containers were not safely removed.")
      latest.phase = 1
      latest.ptyID = undefined
      await store.write(record)
      await execute(record, checkout, devenv, operation, domain)
      return
    }
    if (latest.action === "setup" || latest.action === "start") {
      const ready = await waitForReadiness(
        record,
        devenv,
        latest.action === "setup" ? 1 : (options.readinessAttempts ?? 90),
        operation,
      )
      if (operation.cancelled) {
        latest.status = "cancelled"
        latest.exitCode = 130
        latest.endedAt = Date.now()
        await refresh(record, devenv)
        await store.write(record)
        return
      }
      if (!ready) {
        latest.status = "failed"
        latest.endedAt = Date.now()
        append(latest, "\nHTTP readiness could not be verified for this environment.\n")
        await refresh(record, devenv)
        await store.write(record)
        return
      }
    }
    latest.status = "succeeded"
    latest.endedAt = Date.now()
    await refresh(record, devenv)
    await store.write(record)
  }

  async function waitForReadiness(
    record: EnvironmentRecord,
    devenv: DevenvInstallation,
    attempts: number,
    operation: ActiveOperation,
  ) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (operation.cancelled) return false
      const stack = await inspectStack(devenv, record.directory)
      if (stack.status !== "configured") return false
      const checked = await checkReadiness(devenv, stack.assignment, command)
      if (checked.ready) {
        record.assignment = stack.assignment
        record.http = { status: "ready", checkedAt: Date.now(), statusCode: checked.statusCode }
        return true
      }
      if (attempt + 1 < attempts) await Bun.sleep(options.readinessDelayMs ?? 1000)
    }
    record.http = { status: "unreachable", checkedAt: Date.now() }
    return false
  }

  async function refresh(record: EnvironmentRecord, devenv: DevenvInstallation) {
    const stack = await inspectStack(devenv, record.directory)
    record.assignment = stack.status === "configured" ? stack.assignment : undefined
    if (record.latestRun?.action === "stop" || record.latestRun?.action === "remove")
      record.http = { status: "unknown" }
  }

  async function claim(
    projectID: string,
    record: EnvironmentRecord | undefined,
    checkout: Checkout,
    stack: Awaited<ReturnType<typeof inspectStack>>,
  ) {
    if (record && (await owns(record, checkout))) return record
    if (record && stack.status === "configured") return
    const marker = await readOwner(checkout.gitDirectory)
    if (marker && (marker.projectID !== projectID || marker.directory !== checkout.directory)) return
    const owner = {
      token: marker?.token ?? randomUUID(),
      gitDirectory: checkout.gitDirectory,
    }
    const next: EnvironmentRecord = {
      version: 2,
      backend: "local",
      projectID,
      directory: checkout.directory,
      owner,
    }
    await writeOwner(checkout.gitDirectory, next.projectID, checkout.directory, owner.token)
    await store.write(next)
    return next
  }

  function release(operation: ActiveOperation, record: EnvironmentRecord) {
    const environmentKey = key(record.projectID, record.directory)
    if (active.get(environmentKey) === operation) active.delete(environmentKey)
  }
}

function commandFor(
  devenv: DevenvInstallation,
  directory: string,
  action: Action,
  phase: number,
  assignment?: StackAssignment,
  domain?: string,
) {
  if (action === "setup") {
    return { command: devenv.setup, args: [directory, ...(domain ? ["--domain", domain] : [])] }
  }
  if (action === "remove") {
    if (!assignment) throw new Error("The environment assignment is unavailable for removal.")
    const expected = [
      "--expect",
      assignment.stackID,
      assignment.composeProject,
      assignment.infrastructureProject,
      assignment.host,
      assignment.sourceDirectory,
    ]
    if (phase === 0) return { command: devenv.executable, args: ["down", ...expected] }
    return {
      command: devenv.executable,
      args: ["stack", "clear", ...expected],
    }
  }
  return { command: devenv.executable, args: [action] }
}

function key(projectID: string, directory: string) {
  return `${projectID}\0${directory}`
}

function environmentGroup(projectID: string, directory: string) {
  return `ses_boc_environment_${createHash("sha256").update(projectID).update("\0").update(directory).digest("hex").slice(0, 24)}`
}

function append(run: EnvironmentRun, value: string) {
  const next = Buffer.from(run.log + value)
  if (next.byteLength <= LOG_LIMIT) {
    run.log = next.toString("utf8")
    return
  }
  run.log = next.subarray(next.byteLength - LOG_LIMIT).toString("utf8")
  run.truncated = true
}

function publicRun(run: EnvironmentRun | undefined): Run | undefined {
  if (!run) return
  return {
    id: run.id,
    action: run.action,
    status: run.status,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    exitCode: run.exitCode,
    log: run.log,
    truncated: run.truncated,
  }
}

function state(
  projectID: string,
  directory: string,
  availability: Availability,
  stack: Stack,
  containers: ContainerInspection,
  record: EnvironmentRecord | undefined,
): State {
  return {
    backend: "local",
    projectID: projectID as State["projectID"],
    directory: directory as State["directory"],
    availability,
    stack,
    containers: publicContainers(containers),
    http: record?.http ?? { status: "unknown" },
    latestRun: publicRun(record?.latestRun),
  }
}

function unavailable(
  projectID: string,
  directory: string,
  record: EnvironmentRecord | undefined,
  reason: Extract<Availability, { available: false }>["reason"],
  stack: Stack = { status: "unconfigured" },
): State {
  return state(
    projectID,
    directory,
    { available: false, reason },
    stack,
    { status: "unknown", total: 0, running: 0, owned: false },
    record,
  )
}

function stackState(value: Awaited<ReturnType<typeof inspectStack>>): Stack {
  if (value.status !== "configured") return { status: value.status }
  return {
    status: "configured",
    stackID: value.assignment.stackID,
    composeProject: value.assignment.composeProject,
    infrastructureProject: value.assignment.infrastructureProject,
    host: value.assignment.host,
    url: value.assignment.url,
    sourceDirectory: value.assignment.sourceDirectory as State["directory"],
  }
}

function publicContainers(value: ContainerInspection): Containers {
  return { status: value.status, total: value.total, running: value.running }
}

function rejected(
  reason: Extract<OperationResult, { accepted: false }>["reason"],
  environment: State,
): OperationResult {
  return { accepted: false, reason, environment }
}

async function owns(record: EnvironmentRecord | undefined, checkout: Checkout) {
  if (!record) return true
  if (record.directory !== checkout.directory) return false
  if (record.owner.gitDirectory !== checkout.gitDirectory) return false
  const marker = await readOwner(checkout.gitDirectory)
  return (
    marker?.token === record.owner.token &&
    marker.projectID === record.projectID &&
    marker.directory === record.directory
  )
}

async function readOwner(gitDirectory: string) {
  const value = await Bun.file(path.join(gitDirectory, OWNER_FILE))
    .json()
    .catch(() => undefined)
  if (
    !value ||
    value.version !== 1 ||
    typeof value.projectID !== "string" ||
    typeof value.directory !== "string" ||
    typeof value.token !== "string"
  )
    return
  return value as { version: 1; projectID: string; directory: string; token: string }
}

async function writeOwner(gitDirectory: string, projectID: string, directory: string, token: string) {
  const destination = path.join(gitDirectory, OWNER_FILE)
  const temporary = `${destination}.${randomUUID()}.tmp`
  await Bun.write(temporary, `${JSON.stringify({ version: 1, projectID, directory, token }, undefined, 2)}\n`)
  await fs.rename(temporary, destination)
}

function sameAssignment(left: StackAssignment, right: StackAssignment) {
  return (
    left.stackID === right.stackID &&
    left.composeProject === right.composeProject &&
    left.infrastructureProject === right.infrastructureProject &&
    left.host === right.host &&
    left.sourceDirectory === right.sourceDirectory &&
    left.configFile === right.configFile
  )
}
