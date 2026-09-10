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

    fixture.createContainers()
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
    await eventually(() => expect(fixture.process.observers(fixture.process.commands[0].id)).toBe(1))
    fixture.process.output(fixture.process.commands[0].id, "before handoff\n")
    fixture.process.disconnect(fixture.process.commands[0].id)

    const replacement = fixture.backend(fixture.registered)
    expect((await replacement.inspect("project", fixture.checkout)).latestRun?.status).toBe("running")
    fixture.createContainers()
    fixture.process.output(fixture.process.commands[0].id, "after handoff\n")
    fixture.process.exit(fixture.process.commands[0].id, 0)

    await eventually(async () => {
      const state = await replacement.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.latestRun?.log).toContain("before handoff")
      expect(state.latestRun?.log).toContain("after handoff")
    })
  })

  test("runs worktree-up with the selected domain and derived Lane identity", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)

    expect(
      (
        await backend.run({
          projectID: "project",
          directory: fixture.checkout,
          sessionID: "session",
          action: "setup",
          domain: " bergfreunde.at ",
        })
      ).accepted,
    ).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    expect(fixture.process.commands[0].input).toMatchObject({
      command: path.join(fixture.root, "devenv", "scripts", "worktree-up.sh"),
      args: [fixture.checkout, "--domain", "bergfreunde.at"],
    })
    fixture.createContainers()
    fixture.process.exit(fixture.process.commands[0].id, 0)

    await eventually(async () => {
      expect((await backend.inspect("project", fixture.checkout)).stack).toMatchObject({
        status: "configured",
        stackID: "project",
        composeProject: "devenv-project",
        infrastructureProject: "devenv",
        url: "https://project.bergfreunde.at.localhost/",
      })
    })
  })

  test("requires confirmation and verified ownership before remove", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    await configure(fixture, backend)

    const unconfirmed = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
    })
    expect(unconfirmed).toMatchObject({ accepted: false, reason: "confirmation-required" })
    expect(fixture.process.commands).toHaveLength(1)

    fixture.containers.owned = false
    const unowned = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
      confirmation: "remove-environment",
    })
    expect(unowned).toMatchObject({ accepted: false, reason: "not-available" })
    expect(fixture.process.commands).toHaveLength(1)

    fixture.containers.owned = true
    const accepted = await backend.run({
      projectID: "project",
      directory: fixture.checkout,
      sessionID: "session",
      action: "remove",
      confirmation: "remove-environment",
    })
    expect(accepted.accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(2))
    expect(fixture.process.commands[1].input).toMatchObject({
      command: path.join(fixture.root, "devenv", "scripts", "worktree-down.sh"),
      args: [fixture.checkout],
    })
    fixture.containers.present = false
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

  test("reconciles a fast successful worktree-down after its PTY closes before attachment", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    await configure(fixture, backend)
    fixture.process.closeBeforeObservation = (input) => input.args[0] === fixture.checkout

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
    await eventually(() => expect(fixture.process.commands).toHaveLength(2))
    await eventually(async () => {
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("failed")
    })

    fixture.containers.present = false
    const reconciled = await backend.inspect("project", fixture.checkout)
    expect(reconciled.availability).toEqual({ available: true })
    expect(reconciled.latestRun?.status).toBe("succeeded")
    expect(reconciled.stack.status).toBe("unconfigured")
    expect(reconciled.containers.status).toBe("absent")
  })

  test("runs start and stop as distinct fixed devenv actions", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    await configure(fixture, backend)
    fixture.containers.running = false

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
    await eventually(() => expect(fixture.process.commands[1].input.args).toEqual(["start"]))
    fixture.containers.running = true
    fixture.process.exit(fixture.process.commands[1].id, 0)
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
    await eventually(() => expect(fixture.process.commands[2].input.args).toEqual(["stop"]))
    fixture.containers.running = false
    fixture.process.exit(fixture.process.commands[2].id, 0)
    await eventually(async () => {
      const state = await backend.inspect("project", fixture.checkout)
      expect(state.latestRun?.status).toBe("succeeded")
      expect(state.containers.status).toBe("stopped")
      expect(state.http.status).toBe("unknown")
    })
  })

  test("does not remove containers outside the convention-owned Compose stack", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    await configure(fixture, backend)
    fixture.containers.owned = false

    expect(
      await backend.run({
        projectID: "project",
        directory: fixture.checkout,
        sessionID: "session",
        action: "remove",
        confirmation: "remove-environment",
      }),
    ).toMatchObject({ accepted: false, reason: "not-available" })
    expect(fixture.process.commands).toHaveLength(1)
  })

  test("does not adopt a stack after checkout path reuse", async () => {
    const fixture = await environmentFixture()
    const backend = fixture.backend(fixture.registered)
    expect((await setup(backend, "project", fixture.checkout)).accepted).toBe(true)
    await eventually(() => expect(fixture.process.commands).toHaveLength(1))
    fixture.createContainers()
    fixture.process.exit(fixture.process.commands[0].id, 1)
    await eventually(async () =>
      expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("failed"),
    )

    const replacementGit = path.join(fixture.root, "replacement-git")
    await fs.mkdir(replacementGit)
    const reused = fixture.backend(async (_projectID, directory) => ({
      available: true,
      checkout: { directory, gitDirectory: replacementGit },
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

async function configure(fixture: Awaited<ReturnType<typeof environmentFixture>>, backend: EnvironmentBackend) {
  expect((await setup(backend, "project", fixture.checkout)).accepted).toBe(true)
  await eventually(() => expect(fixture.process.commands.length).toBeGreaterThan(0))
  fixture.createContainers()
  const command = fixture.process.commands.at(-1)!
  fixture.process.exit(command.id, 0)
  await eventually(async () => {
    expect((await backend.inspect("project", fixture.checkout)).latestRun?.status).toBe("succeeded")
  })
}

async function environmentFixture(count = 1) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-environment-")))
  cleanup.push(root)
  const devenvRoot = path.join(root, "devenv")
  const stateDirectory = path.join(root, "state")
  const checkouts = Array.from({ length: count }, (_, index) =>
    path.join(devenvRoot, "src", ".lane", "trees", count === 1 ? "project" : `project-${index === 0 ? "a" : "b"}`),
  )
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
    up: path.join(devenvRoot, "scripts", "worktree-up.sh"),
    down: path.join(devenvRoot, "scripts", "worktree-down.sh"),
    root: devenvRoot,
    environment: { PATH: process.env.PATH ?? "" },
  }
  const processHost = new FakeProcessHost()
  const containers = { present: false, running: true, owned: true }
  const command = async (input: Command): Promise<CommandResult> => {
    if (input.executable === "curl") {
      const stackID = new URL(input.args.at(-1)!).hostname.split(".")[0]
      return { exitCode: 0, stdout: `HTTP/2 200\r\nx-devenv-worktree: ${stackID}\r\n\r\n`, stderr: "" }
    }
    if (input.args[0] === "network") return { exitCode: 0, stdout: "[]", stderr: "" }
    if (input.args[0] === "ps") {
      const project = input.args.at(-1)?.split("=").at(-1)
      return { exitCode: 0, stdout: containers.present ? `${project}-container\n` : "", stderr: "" }
    }
    if (input.args[0] === "inspect") {
      const project = input.args.at(-1)?.replace(/-container$/, "")
      const labels = {
        "com.docker.compose.project": project,
        "com.docker.compose.project.working_dir": containers.owned ? devenvRoot : path.join(root, "another-devenv"),
        "com.docker.compose.project.config_files": `${path.join(devenvRoot, "docker-compose.yml")},${path.join(devenvRoot, "docker-compose.worktree.yml")}`,
      }
      return { exitCode: 0, stdout: `${JSON.stringify(labels)}\t${containers.running}\n`, stderr: "" }
    }
    return { exitCode: 1, stdout: "", stderr: "unexpected command" }
  }
  const registered = async (_projectID: string, directory: string): Promise<CheckoutResult> => {
    const gitDirectory = gitDirectories.get(directory)
    if (!gitDirectory) return { available: false, reason: "checkout-not-registered" }
    return { available: true, checkout: { directory, gitDirectory } }
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
  const createContainers = () => {
    containers.present = true
  }
  return {
    root,
    checkout: checkouts[0],
    checkouts,
    process: processHost,
    containers,
    registered,
    backend,
    createContainers,
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

  observers(id: string) {
    return this.#processes.get(id)?.observers.length ?? 0
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
