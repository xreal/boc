import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createEnvironmentBackend, type CheckoutResult, type EnvironmentBackend } from "./backend"
import type { Command, CommandResult, DevenvInstallation } from "./devenv"
import type { ProcessHost, ProcessInfo, ProcessInput, ProcessObservation } from "./process"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("development environments", () => {
  test("rejects paths that are not registered isolated checkouts", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(async () => ({ available: false, reason: "checkout-not-registered" }))

    const state = await backend.inspect("project", fixture.checkout)

    expect(state.availability).toEqual({ available: false, reason: "checkout-not-registered" })
    expect(fixture.process.commands).toHaveLength(0)
  })

  test("deduplicates one checkout while different environments run in parallel", async () => {
    const fixture = await environmentFixture(2)
    const backend = fixture.backend(fixture.registered)

    expect((await setup(backend, "project-a", fixture.checkouts[0])).accepted).toBe(true)
    expect((await setup(backend, "project-a", fixture.checkouts[0])).accepted).toBe(false)
    expect((await setup(backend, "project-b", fixture.checkouts[1])).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(2))

    await Promise.all([
      fixture.writeStack(fixture.checkouts[0], "project-a"),
      fixture.writeStack(fixture.checkouts[1], "project-b"),
    ])
    fixture.process.exit(fixture.process.commands[0].id, 0)
    fixture.process.exit(fixture.process.commands[1].id, 0)

    await eventually(async () => {
      expect((await backend.inspect("project-a", fixture.checkouts[0])).latestRun?.status).toBe("succeeded")
      expect((await backend.inspect("project-b", fixture.checkouts[1])).latestRun?.status).toBe("succeeded")
    })
  })

  test("retains bounded failure logs and supports retry cancellation", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    expect((await setup(backend, "project", fixture.checkout)).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    fixture.process.output(fixture.process.commands[0].id, "x".repeat(70 * 1024))
    fixture.process.exit(fixture.process.commands[0].id, 7)

    await eventually(async () => {
      const state = await backend.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("failed")
      expect(state.latestRun?.exitCode).toBe(7)
      expect(state.latestRun?.truncated).toBe(true)
      expect(Buffer.byteLength(state.latestRun?.log ?? "")).toBeLessThanOrEqual(64 * 1024)
    })

    expect((await setup(backend, "project", fixture.checkout)).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(2))
    expect((await backend.cancel("project", fixture.checkout)).cancelled).toBe(true)
    await eventually(async () => {
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("cancelled")
    })

    const restored = fixture.backend(fixture.registered)
    expect((await restored.inspect("project", fixture.checkout)).latestRun?.status).toBe("cancelled")
  })

  test("reattaches a running operation after a backend handoff", async () => {
    const fixture = await environmentFixture()
    const first = fixture.backend(fixture.registered)
    expect((await setup(first, "project", fixture.checkout)).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    fixture.process.output(fixture.process.commands[0].id, "before handoff\n")
    fixture.process.disconnect(fixture.process.commands[0].id)

    const replacement = fixture.backend(fixture.registered)
    expect((await replacement.inspect("project", fixture.checkout)).latestRun?.status).toBe("running")
    await fixture.writeStack(fixture.checkout, "project")
    fixture.process.output(fixture.process.commands[0].id, "after handoff\n")
    fixture.process.exit(fixture.process.commands[0].id, 0)

    await eventually(async () => {
      const state = await replacement.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.latestRun?.log).toContain("before handoff")
      expect(state.latestRun?.log).toContain("after handoff")
    })
  })

  test("requires confirmation and verified ownership before remove", async () => {
    const fixture = await environmentFixture()
    await fixture.writeStack(fixture.checkout, "project")
    fixture.containers.present = true
    const backend = fixture.backend(fixture.registered)

    const unconfirmed = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
    })
    expect(unconfirmed).toMatchObject({ accepted: false, reason: "confirmation-required" })
    expect(fixture.process.commands).toHaveLength(0)

    fixture.capabilities.guardedRemoval = false
    const unsupported = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
      confirmation: "remove-environment",
    })
    expect(unsupported).toMatchObject({ accepted: false, reason: "not-available" })
    expect(fixture.process.commands).toHaveLength(0)

    fixture.capabilities.guardedRemoval = true
    const accepted = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
      confirmation: "remove-environment",
    })
    expect(accepted.accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    expect(fixture.process.commands[0].input.args).toEqual([
      "down",
      "--expect",
      "project",
      "devenv-project",
      "devenv",
      "project.bergfreunde.de.localhost",
      fixture.checkout,
    ])
    fixture.containers.present = false
    fixture.process.exit(fixture.process.commands[0].id, 0)

    await eventually(() => expect(fixture.process.commands).toHaveLength(2))
    expect(fixture.process.commands[1].input.args).toEqual([
      "stack",
      "clear",
      "--expect",
      "project",
      "devenv-project",
      "devenv",
      "project.bergfreunde.de.localhost",
      fixture.checkout,
    ])
    await fs.rm(fixture.stackFile(fixture.checkout))
    fixture.process.exit(fixture.process.commands[1].id, 0)

    await eventually(async () => {
      const state = await backend.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.stack.status).toBe("unconfigured")
    })
    expect(fixture.process.commands.flatMap((item) => item.input.args)).not.toContain("clean")
    expect(fixture.process.commands.flatMap((item) => item.input.args)).not.toContain("destroy")
    expect(fixture.process.commands.flatMap((item) => item.input.args)).not.toContain("reset")
  })

  test("reconciles a fast successful stack clear after its PTY closes before attachment", async () => {
    const fixture = await environmentFixture()
    const stackFile = await fixture.writeStack(fixture.checkout, "project")
    fixture.containers.present = true
    fixture.process.closeBeforeObservation = (input) => input.args[0] === "stack"
    const backend = fixture.backend(fixture.registered)

    expect(
      (
        await backend.run({
          projectID: "project",
          directory: fixture.checkout,
          sessionID: "session",
          action: "remove",
          confirmation: "remove-environment",
        })
      ).accepted,
    ).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    fixture.containers.present = false
    fixture.process.exit(fixture.process.commands[0].id, 0)
    await eventually(async () => {
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("failed")
    })

    await fs.rm(stackFile)
    const reconciled = await backend.inspect("project", fixture.checkout)
    expect(reconciled.availability).toEqual({ available: true, strategy: "git" })
    expect(reconciled.latestRun?.status).toBe("succeeded")
    expect(reconciled.stack.status).toBe("unconfigured")
    expect(reconciled.containers.status).toBe("absent")
  })

  test("runs start and stop as distinct fixed devenv actions", async () => {
    const fixture = await environmentFixture()
    await fixture.writeStack(fixture.checkout, "project")
    fixture.containers.present = true
    fixture.containers.running = false
    const backend = fixture.backend(fixture.registered)

    expect(
      (
        await backend.run({
          projectID: "project",
          directory: fixture.checkout,
          sessionID: "session",
          action: "start",
        })
      ).accepted,
    ).toBe(true)
    await eventually(() => expect(fixture.process.commands[0].input.args).toEqual(["start"]))
    fixture.containers.running = true
    fixture.process.exit(fixture.process.commands[0].id, 0)
    await eventually(async () => {
      const state = await backend.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.containers.status).toBe("running")
      expect(state.http.status).toBe("ready")
    })

    expect(
      (
        await backend.run({
          projectID: "project",
          directory: fixture.checkout,
          sessionID: "another-session",
          action: "stop",
        })
      ).accepted,
    ).toBe(true)
    await eventually(() => expect(fixture.process.commands[1].input.args).toEqual(["stop"]))
    fixture.containers.running = false
    fixture.process.exit(fixture.process.commands[1].id, 0)
    await eventually(async () => {
      const state = await backend.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.containers.status).toBe("stopped")
      expect(state.http.status).toBe("unknown")
    })
  })

  test("does not clear a replacement stack assignment after devenv down", async () => {
    const fixture = await environmentFixture()
    const stackFile = await fixture.writeStack(fixture.checkout, "project")
    fixture.containers.present = true
    const backend = fixture.backend(fixture.registered)

    expect(
      (
        await backend.run({
          projectID: "project",
          directory: fixture.checkout,
          sessionID: "session",
          action: "remove",
          confirmation: "remove-environment",
        })
      ).accepted,
    ).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))

    fixture.containers.present = false
    await Bun.write(
      stackFile,
      (await Bun.file(stackFile).text()).replace(
        "INFRASTRUCTURE_PROJECT_NAME=devenv",
        "INFRASTRUCTURE_PROJECT_NAME=replacement",
      ),
    )
    fixture.process.exit(fixture.process.commands[0].id, 0)

    await eventually(async () => {
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("failed")
    })
    expect(fixture.process.commands).toHaveLength(1)
  })

  test("does not adopt a stack after checkout path reuse", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    expect((await setup(backend, "project", fixture.checkout)).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    await fixture.writeStack(fixture.checkout, "project")
    fixture.process.exit(fixture.process.commands[0].id, 1)
    await eventually(async () =>
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("failed"),
    )

    const replacementGit = path.join(fixture.root, "replacement-git")
    await fs.mkdir(replacementGit)
    const reused = fixture.backend(async (_projectID, directory) => ({
      available: true,
      checkout: { directory, strategy: "git", gitDirectory: replacementGit },
    }))
    expect((await reused.inspect("project", fixture.checkout)).availability).toEqual({
      available: false,
      reason: "checkout-ownership-mismatch",
    })
    expect((await setup(reused, "project", fixture.checkout)).accepted).toBe(false)
    expect(fixture.process.commands).toHaveLength(1)
  })
})

async function setup(backend: EnvironmentBackend, projectID: string, directory: string) {
  return backend.run({ projectID, directory, sessionID: "session", action: "setup" })
}

async function environmentFixture(count = 1) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-environment-")))
  cleanup.push(root)
  const devenvRoot = path.join(root, "devenv")
  const stateDirectory = path.join(root, "state")
  const checkouts = Array.from({ length: count }, (_, index) => path.join(root, `checkout-${index}`))
  const gitDirectories = new Map(checkouts.map((directory, index) => [directory, path.join(root, `git-${index}`)]))
  await Promise.all([
    fs.mkdir(path.join(devenvRoot, "src", "common", "config"), { recursive: true }),
    fs.mkdir(path.join(devenvRoot, "src", "shop", "source"), { recursive: true }),
    fs.mkdir(path.join(devenvRoot, "secrets"), { recursive: true }),
    fs.mkdir(path.join(devenvRoot, "config"), { recursive: true }),
    ...checkouts.flatMap((directory) => [
      fs.mkdir(path.join(directory, "shop"), { recursive: true }),
      fs.mkdir(gitDirectories.get(directory)!, { recursive: true }),
    ]),
  ])
  await Promise.all([
    Bun.write(path.join(devenvRoot, "src", "shop", "source", ".env"), "TEST=1\n"),
    Bun.write(path.join(devenvRoot, "secrets", "prepared.txt.example"), ""),
    Bun.write(path.join(devenvRoot, "secrets", "prepared.txt"), ""),
    Bun.write(path.join(devenvRoot, "config", "storefront-domains.txt"), "bergfreunde.de\n"),
  ])
  const installation: DevenvInstallation = {
    executable: path.join(devenvRoot, "devenv.sh"),
    setup: path.join(devenvRoot, "scripts", "worktree-setup.sh"),
    root: devenvRoot,
    environment: { PATH: process.env.PATH ?? "" },
  }
  const processHost = new FakeProcessHost()
  const containers = { present: false, running: true }
  const capabilities = { guardedRemoval: true }
  const command = async (input: Command): Promise<CommandResult> => {
    if (input.executable === "curl") {
      const stackID = new URL(input.args.at(-1)!).hostname.split(".")[0]
      return { exitCode: 0, stdout: `HTTP/2 200\r\nx-devenv-worktree: ${stackID}\r\n\r\n`, stderr: "" }
    }
    if (input.args[0] === "network") return { exitCode: 0, stdout: "[]", stderr: "" }
    if (input.args[0] === "stack" && input.args[1] === "capabilities") {
      return capabilities.guardedRemoval
        ? { exitCode: 0, stdout: "guarded-removal-v1\n", stderr: "" }
        : { exitCode: 0, stdout: "", stderr: "" }
    }
    if (input.args[0] === "ps") return { exitCode: 0, stdout: containers.present ? "container-1\n" : "", stderr: "" }
    if (input.args[0] === "inspect") {
      const project = input.args.find((value) => value.startsWith("container")) ? "project" : "project"
      const labels = {
        "com.docker.compose.project": "devenv-project",
        "com.docker.compose.project.working_dir": devenvRoot,
        "com.docker.compose.project.config_files": `${path.join(devenvRoot, "docker-compose.yml")},${path.join(devenvRoot, "docker-compose.worktree.yml")}`,
      }
      return { exitCode: 0, stdout: `${JSON.stringify(labels)}\t${containers.running}\n`, stderr: "" }
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected command" }
  }
  const registered = async (_projectID: string, directory: string): Promise<CheckoutResult> => {
    const gitDirectory = gitDirectories.get(directory)
    if (!gitDirectory) return { available: false, reason: "checkout-not-registered" }
    return { available: true, checkout: { directory, strategy: "git", gitDirectory } }
  }
  const backend = (checkout: (projectID: string, directory: string) => Promise<CheckoutResult>) =>
    createEnvironmentBackend({
      enabled: true,
      stateDirectory,
      process: processHost,
      checkout,
      installation: async () => installation,
      command,
      readinessAttempts: 2,
      readinessDelayMs: 1,
    })
  const stackID = (directory: string) => `project-${checkouts.indexOf(directory)}`
  const stackFile = (directory: string) => path.join(devenvRoot, ".devenv", "worktrees", `${stackID(directory)}.env`)
  const writeStack = async (directory: string, projectID: string) => {
    const id = projectID === "project" ? "project" : projectID
    const file = path.join(devenvRoot, ".devenv", "worktrees", `${id}.env`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await Bun.write(
      file,
      [
        `STACK_ID=${id}`,
        "STACK_DOMAIN=bergfreunde.de",
        `COMPOSE_PROJECT_NAME=devenv-${id}`,
        "DEVENV_SHARED_INFRASTRUCTURE=true",
        "INFRASTRUCTURE_PROJECT_NAME=devenv",
        `STACK_HOST=${id}.bergfreunde.de.localhost`,
        `SHOP_CONTAINER_NAME=devenv-${id}-shop`,
        `DEVENV_SRC_PATH=${directory.replaceAll(" ", "\\ ")}`,
        "",
      ].join("\n"),
    )
    return file
  }
  return {
    root,
    checkout: checkouts[0],
    checkouts,
    process: processHost,
    containers,
    capabilities,
    registered,
    backend,
    writeStack,
    stackFile: (directory: string) =>
      path.join(devenvRoot, ".devenv", "worktrees", `${checkouts.length === 1 ? "project" : stackID(directory)}.env`),
  }
}

class FakeProcessHost implements ProcessHost {
  closeBeforeObservation?: (input: ProcessInput) => boolean
  readonly commands: Array<{ id: string; input: ProcessInput }> = []
  readonly #processes = new Map<
    string,
    {
      status: "running" | "exited"
      exitCode?: number
      output: Buffer
      closedBeforeObservation?: boolean
      observers: Array<{
        output: (event: { data: Uint8Array; end: number }) => void
        resolve: (value: { exitCode?: number; finalOffset: number; disconnected?: boolean }) => void
      }>
    }
  >()

  async create(input: ProcessInput): Promise<ProcessInfo> {
    const id = `pty-${this.commands.length + 1}`
    this.commands.push({ id, input })
    const closedBeforeObservation = this.closeBeforeObservation?.(input) ?? false
    this.#processes.set(id, {
      status: closedBeforeObservation ? "exited" : "running",
      exitCode: closedBeforeObservation ? 0 : undefined,
      output: Buffer.alloc(0),
      observers: [],
      closedBeforeObservation,
    })
    return { id, status: "running", outputTail: 0 }
  }

  async get(id: string): Promise<ProcessInfo | undefined> {
    const process = this.#processes.get(id)
    if (!process) return
    return { id, status: process.status, exitCode: process.exitCode, outputTail: process.output.byteLength }
  }

  async observe(
    id: string,
    cursor: number,
    onOutput: (event: { data: Uint8Array; end: number }) => void,
  ): Promise<ProcessObservation> {
    const process = this.#processes.get(id)
    if (!process) throw new Error("process not found")
    if (process.closedBeforeObservation) throw new Error("process closed before attachment")
    let resolveExit: (value: { exitCode?: number; finalOffset: number; disconnected?: boolean }) => void = () => {}
    const done = new Promise<{ exitCode?: number; finalOffset: number; disconnected?: boolean }>((resolve) => {
      resolveExit = resolve
    })
    process.observers.push({ output: onOutput, resolve: resolveExit })
    if (process.status === "exited") resolveExit({ exitCode: process.exitCode, finalOffset: process.output.byteLength })
    return {
      replay: process.output.subarray(cursor),
      replayEnd: process.output.byteLength,
      truncated: false,
      done,
      detach: () => undefined,
    }
  }

  async terminate(id: string) {
    this.exit(id, 130)
  }

  output(id: string, value: string) {
    const process = this.#processes.get(id)!
    const data = Buffer.from(value)
    process.output = Buffer.concat([process.output, data])
    process.observers.forEach((observer) => observer.output({ data, end: process.output.byteLength }))
  }

  exit(id: string, exitCode: number) {
    const process = this.#processes.get(id)!
    process.status = "exited"
    process.exitCode = exitCode
    process.observers.forEach((observer) => observer.resolve({ exitCode, finalOffset: process.output.byteLength }))
  }

  disconnect(id: string) {
    const process = this.#processes.get(id)!
    process.observers.forEach((observer) =>
      observer.resolve({ finalOffset: process.output.byteLength, disconnected: true }),
    )
    process.observers = []
  }
}

async function eventually(assertion: () => void | Promise<void>) {
  let failure: unknown
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await assertion()
      return
    } catch (error) {
      failure = error
      await Bun.sleep(5)
    }
  }
  throw failure
}
