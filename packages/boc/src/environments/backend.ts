import type {
  Action,
  Availability,
  CancelResult,
  Containers,
  ContainerLogs,
  OperationResult,
  Run,
  Stack,
  State,
} from "@opencode/schema/boc/environment"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { StringDecoder } from "node:string_decoder"
import type { ProcessHost, ProcessObservation } from "./process"
import {
  checkReadiness,
  createStackAssignment,
  inspectContainers,
  inspectStack,
  preflight,
  resolveDevenv,
  runCommand,
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
  readonly agentContext: (projectID: string, directory: string) => Promise<AgentEnvironment | undefined>
  readonly inspect: (projectID: string, directory: string) => Promise<State>
  readonly run: (input: {
    readonly projectID: string
    readonly directory: string
    readonly sessionID: string
    readonly action: Action
    readonly domain?: string
    readonly confirmation?: "remove-environment"
    readonly containerID?: string
  }) => Promise<OperationResult>
  readonly cancel: (projectID: string, directory: string) => Promise<CancelResult>
  readonly logs: (input: { projectID: string; directory: string; containerID: string }) => Promise<ContainerLogs>
  readonly resize: (input: {
    projectID: string
    directory: string
    runID: string
    cols: number
    rows: number
  }) => Promise<boolean>
}

export type AgentEnvironment = Pick<StackAssignment, "stackID" | "host" | "url">

type ActiveOperation = {
  cancelled: boolean
  completion: Promise<void>
  observation?: ProcessObservation
  record?: EnvironmentRecord
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

  const agentContext: EnvironmentBackend["agentContext"] = async (projectID, requestedDirectory) => {
    if (!options.enabled) return undefined
    if (process.platform !== "darwin" && process.platform !== "linux") return undefined
    const directory = path.resolve(requestedDirectory)
    const record = await store.read(projectID, directory)
    if (!record?.assignment) return undefined
    const checkout = await options.checkout(projectID, directory)
    if (!checkout.available || !(await owns(record, checkout.checkout))) return undefined
    const devenv = await installation()
    if (!devenv) return undefined
    const stack = inspectStack(devenv, checkout.checkout.directory, record.assignment)
    if (stack.status !== "configured") return undefined
    return {
      stackID: stack.assignment.stackID,
      host: stack.assignment.host,
      url: stack.assignment.url,
    }
  }

  const inspect = async (projectID: string, requestedDirectory: string, readiness = true): Promise<State> => {
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
    const ownership = await owns(record, checkout.checkout)
    const stack = inspectStack(devenv, checkout.checkout.directory, record?.assignment)
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
      await reconcile(record, devenv)
    }
    const latestRecord =
      active.get(key(projectID, checkout.checkout.directory))?.record ??
      (await store.read(projectID, checkout.checkout.directory))
    if (
      latestRecord?.assignment &&
      latestRecord.latestRun?.action === "remove" &&
      latestRecord.latestRun.status !== "running" &&
      latestRecord.latestRun.exitCode === 0 &&
      (await completeRemoval(latestRecord, devenv))
    ) {
      latestRecord.latestRun.status = "succeeded"
      latestRecord.latestRun.endedAt ??= Date.now()
      await store.write(latestRecord)
    }
    const latestStack = inspectStack(devenv, checkout.checkout.directory, latestRecord?.assignment)
    const assignment = latestStack.status === "configured" ? latestStack.assignment : undefined
    const containers = assignment
      ? await inspectContainers(devenv, assignment, command)
      : { status: "absent" as const, total: 0, running: 0, owned: true }
    if (readiness && latestRecord && !active.has(key(projectID, checkout.checkout.directory))) {
      const checked =
        assignment && containers.running > 0 && containers.owned
          ? await checkReadiness(devenv, assignment, command, 3)
          : undefined
      latestRecord.http = checked
        ? checked.ready
          ? { status: "ready", checkedAt: Date.now(), statusCode: checked.statusCode }
          : { status: "unreachable", checkedAt: Date.now() }
        : { status: "unknown" }
    }
    return state(
      projectID,
      checkout.checkout.directory,
      { available: true },
      stackState(latestStack),
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
      if (
        (input.containerID && !["start", "stop", "restart"].includes(input.action)) ||
        (input.action === "restart" && !input.containerID)
      ) {
        return rejected("not-available", before)
      }
      if (input.action === "remove" && input.confirmation !== "remove-environment") {
        return rejected("confirmation-required", before)
      }
      const checkout = await options.checkout(input.projectID, before.directory)
      if (!checkout.available) return rejected("not-available", before)
      const devenv = await installation()
      if (!devenv) return rejected("not-available", before)
      const existingRecord = await store.read(input.projectID, checkout.checkout.directory)
      const currentStack = inspectStack(devenv, checkout.checkout.directory, existingRecord?.assignment)
      if (input.action !== "setup" && currentStack.status !== "configured") {
        return rejected("not-configured", before)
      }
      const domain = input.domain?.trim() || undefined
      const stack =
        input.action === "setup"
          ? createStackAssignment(devenv, checkout.checkout.directory, domain)
          : currentStack.status === "configured"
            ? currentStack.assignment
            : undefined
      if (!stack) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "devenv-preflight-failed" },
        })
      }
      if (
        !input.containerID &&
        (input.action === "setup" || input.action === "start") &&
        !(await preflight(devenv, before.directory, input.action, command))
      ) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "devenv-preflight-failed" },
        })
      }
      const claimed = await claim(input.projectID, existingRecord, checkout.checkout)
      if (!claimed) {
        return rejected("not-available", {
          ...before,
          availability: { available: false, reason: "checkout-ownership-mismatch" },
        })
      }
      const containers = await inspectContainers(devenv, stack, command)
      if (!containers.owned) {
        return rejected("not-available", {
          ...before,
          stack: { status: "invalid" },
          containers: publicContainers(containers),
        })
      }
      const container = input.containerID ? containers.items?.find((item) => item.id === input.containerID) : undefined
      if (input.containerID && !container) return rejected("not-available", before)
      const containerIDs = container ? [container.id] : (containers.items ?? []).map((item) => item.id)
      if ((input.action === "start" || input.action === "stop") && containerIDs.length === 0) {
        return rejected("not-configured", before)
      }
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
          logStart: 0,
          containerID: container?.id,
          service: container?.service,
          phase: "command",
        },
      }
      operation.record = record
      await store.write(record)
      operation.completion = execute(record, checkout.checkout, devenv, operation, containerIDs, domain).finally(() =>
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

  const logs: EnvironmentBackend["logs"] = async (input) => {
    const environment = await inspect(input.projectID, input.directory, false)
    const unavailable = { available: false, text: "", checkedAt: Date.now() }
    if (!environment.availability.available || environment.stack.status !== "configured") return unavailable
    const container = environment.containers.items?.find((item) => item.id === input.containerID)
    if (!container) return unavailable
    const devenv = await installation()
    if (!devenv) return unavailable
    const result = await command({
      executable: "docker",
      args: ["logs", "--timestamps", "--tail", "500", container.id],
      env: devenv.environment,
      outputLimit: LOG_LIMIT,
    }).catch(() => undefined)
    if (!result || result.exitCode !== 0) return unavailable
    // Docker writes the two container streams to separate pipes. Its timestamps
    // restore chronology after reading those pipes concurrently.
    const text = [result.stdout, result.stderr]
      .flatMap((output) => output.split("\n").filter(Boolean))
      .sort((left, right) => left.split(" ", 1)[0].localeCompare(right.split(" ", 1)[0]))
      .join("\n")
    const bytes = Buffer.from(text ? `${text}\n` : "")
    const start = Math.max(0, bytes.byteLength - LOG_LIMIT)
    const boundary = start > 0 ? bytes.indexOf(10, start) + 1 : 0
    return { available: true, text: bytes.subarray(boundary || start).toString("utf8"), checkedAt: Date.now() }
  }

  const resize: EnvironmentBackend["resize"] = async (input) => {
    if (input.cols < 2 || input.cols > 500 || input.rows < 2 || input.rows > 200) return false
    const checkout = await options.checkout(input.projectID, input.directory)
    if (!options.enabled || !checkout.available) return false
    const record = active.get(key(input.projectID, checkout.checkout.directory))?.record
    const latest = record?.latestRun
    if (!latest?.ptyID || latest.id !== input.runID || latest.status !== "running") return false
    if (!(await owns(record, checkout.checkout))) return false
    return options.process.resize(latest.ptyID, input.cols, input.rows).then(
      () => true,
      () => false,
    )
  }

  return { agentContext, inspect, run, cancel, logs, resize }

  async function reconcile(record: EnvironmentRecord, devenv: DevenvInstallation) {
    const environmentKey = key(record.projectID, record.directory)
    if (active.has(environmentKey)) return
    const persisted = await store.read(record.projectID, record.directory)
    if (active.has(environmentKey)) return
    const latest = persisted?.latestRun
    if (!persisted || !latest || latest.id !== record.latestRun?.id || latest.status !== "running") return
    if (!latest.ptyID) {
      await store.write({
        ...persisted,
        latestRun: { ...latest, status: "unknown", endedAt: Date.now() },
      })
      return
    }
    const process = await options.process.get(latest.ptyID).catch(() => undefined)
    if (active.has(environmentKey)) return
    if (!process) {
      await store.write({ ...persisted, latestRun: { ...latest, status: "unknown", endedAt: Date.now() } })
      return
    }
    const operation: ActiveOperation = { cancelled: false, completion: Promise.resolve(), record: persisted }
    active.set(environmentKey, operation)
    operation.completion = continueExecution(persisted, devenv, operation, latest.ptyID).finally(() =>
      release(operation, persisted),
    )
    void operation.completion
  }

  async function execute(
    record: EnvironmentRecord,
    checkout: Checkout,
    devenv: DevenvInstallation,
    operation: ActiveOperation,
    containerIDs: readonly string[],
    domain?: string,
  ) {
    const latest = record.latestRun
    if (!latest) return
    try {
      if (operation.cancelled || latest.status === "cancelled") return
      const spec = commandFor(devenv, checkout.directory, latest.action, containerIDs, domain)
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
      await continueExecution(record, devenv, operation, process.id)
    } catch (error) {
      append(latest, `\n${error instanceof Error ? error.message : String(error)}\n`)
      const process = latest.ptyID ? await options.process.get(latest.ptyID).catch(() => undefined) : undefined
      latest.exitCode ??= process?.exitCode
      if (latest.action === "remove" && latest.exitCode === 0 && (await completeRemoval(record, devenv))) {
        latest.status = "succeeded"
        latest.exitCode ??= 0
        latest.endedAt = Date.now()
        await store.write(record)
        return
      }
      latest.status = operation.cancelled ? "cancelled" : "failed"
      latest.endedAt = Date.now()
      refresh(record)
      await store.write(record)
    }
  }

  async function continueExecution(
    record: EnvironmentRecord,
    devenv: DevenvInstallation,
    operation: ActiveOperation,
    ptyID: string,
  ) {
    const latest = record.latestRun
    if (!latest) return
    const decoder = new StringDecoder("utf8")
    // Live callbacks can arrive before observe resolves. Replay must be consumed first.
    const pending: Array<{ data: Uint8Array; end: number }> = []
    let replayed = false
    const consume = (event: { data: Uint8Array; end: number }) => {
      if (event.end <= latest.outputOffset) return
      const start = event.end - event.data.byteLength
      append(latest, decoder.write(Buffer.from(event.data.subarray(Math.max(0, latest.outputOffset - start)))))
      latest.outputOffset = event.end
    }
    const observation = await options.process.observe(ptyID, latest.outputOffset, (event) => {
      if (!replayed) {
        pending.push(event)
        return
      }
      consume(event)
    })
    operation.observation = observation
    consume({ data: observation.replay, end: observation.replayEnd })
    replayed = true
    pending.forEach(consume)
    if (observation.truncated) latest.truncated = true
    await store.write(record)
    const result = await observation.done
    append(latest, decoder.end())
    operation.observation = undefined
    latest.outputOffset = result.finalOffset
    latest.exitCode = result.exitCode
    if (operation.cancelled || latest.status === "cancelled") {
      latest.status = "cancelled"
      latest.exitCode = 130
      latest.endedAt = Date.now()
      refresh(record)
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
      refresh(record)
      await store.write(record)
      return
    }
    if (latest.action === "remove" && !(await completeRemoval(record, devenv))) {
      throw new Error("The environment containers were not safely removed.")
    }
    if (!latest.containerID && (latest.action === "setup" || latest.action === "start")) {
      latest.phase = "readiness"
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
        refresh(record)
        await store.write(record)
        return
      }
      if (!ready) {
        latest.status = "failed"
        latest.endedAt = Date.now()
        append(latest, "\nHTTP readiness could not be verified for this environment.\n")
        refresh(record)
        await store.write(record)
        return
      }
    }
    latest.status = "succeeded"
    latest.endedAt = Date.now()
    refresh(record)
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
      const stack = inspectStack(devenv, record.directory, record.assignment)
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

  function refresh(record: EnvironmentRecord) {
    if (record.latestRun?.action === "stop" || record.latestRun?.action === "remove")
      record.http = { status: "unknown" }
  }

  async function completeRemoval(record: EnvironmentRecord, devenv: DevenvInstallation) {
    const stack = inspectStack(devenv, record.directory, record.assignment)
    if (stack.status !== "configured") return false
    const containers = await inspectContainers(devenv, stack.assignment, command)
    if (!containers.owned || containers.total !== 0) return false
    record.assignment = undefined
    record.http = { status: "unknown" }
    return true
  }

  async function claim(projectID: string, record: EnvironmentRecord | undefined, checkout: Checkout) {
    if (record && (await owns(record, checkout))) return record
    if (record) return
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
  containerIDs: readonly string[],
  domain?: string,
) {
  if (action === "setup") {
    return { command: devenv.up, args: [directory, ...(domain ? ["--domain", domain] : [])] }
  }
  if (action === "remove") return { command: devenv.down, args: [directory] }
  return { command: "docker", args: [action, ...containerIDs] }
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
  let start = next.byteLength - LOG_LIMIT
  while (start < next.byteLength && (next[start] & 0xc0) === 0x80) start += 1
  run.logStart = (run.logStart ?? 0) + start
  run.log = next.subarray(start).toString("utf8")
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
    logStart: run.logStart ?? 0,
    containerID: run.containerID,
    service: run.service,
    phase: run.phase,
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
  return { status: value.status, total: value.total, running: value.running, items: value.items ?? [] }
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
