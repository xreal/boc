import { describe, expect, test } from "bun:test"
import type { DeploymentCommand, DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { memoryDeploymentStore } from "./store"

const help = "--core --kube-context string --output string --prompts-enabled --selector string"

describe("deployment fleet service", () => {
  test("caches successful reads for thirty seconds and bypasses the cache on refresh", async () => {
    let now = 0
    let lists = 0
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      now: () => now,
      run: healthyRunner(() => {
        lists += 1
        return application("02")
      }),
    })

    await service.listSystems({ requestId: "first", refresh: false })
    await service.listSystems({ requestId: "cached", refresh: false })
    expect(lists).toBe(1)

    await service.listSystems({ requestId: "forced", refresh: true })
    expect(lists).toBe(2)

    now = 30_001
    await service.listSystems({ requestId: "expired", refresh: false })
    expect(lists).toBe(3)
  })

  test("deduplicates simultaneous reads", async () => {
    let lists = 0
    const pending = deferred<string>()
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "linux",
      run: healthyRunner(async () => {
        lists += 1
        return pending.promise
      }),
    })

    const first = service.listSystems({ requestId: "one", refresh: true })
    const second = service.listSystems({ requestId: "two", refresh: true })
    await until(() => lists === 1)
    pending.resolve(application("02"))

    const [left, right] = await Promise.all([first, second])
    expect(left).toEqual(right)
    expect(lists).toBe(1)
  })

  test("retains the last successful fleet when a forced refresh fails", async () => {
    let fail = false
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: healthyRunner(() => (fail ? commandFailure("authentication required") : application("02"))),
    })

    const initial = await service.listSystems({ requestId: "initial", refresh: true })
    fail = true
    const stale = await service.listSystems({ requestId: "refresh", refresh: true })

    expect(initial.ok).toBe(true)
    expect(stale).toMatchObject({
      ok: true,
      systems: [{ environment: "02" }],
      staleFailure: { category: "not-authenticated" },
    })
  })

  test("does not let an older settings generation repopulate the cache", async () => {
    let lists = 0
    const oldRead = deferred<string>()
    const newRead = deferred<string>()
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: healthyRunner(() => {
        lists += 1
        return lists === 1 ? oldRead.promise : newRead.promise
      }),
    })

    const oldResult = service.listSystems({ requestId: "old", refresh: true })
    await until(() => lists === 1)
    const save = service.saveSettings({
      applicationLabelKey: "team",
      applicationLabelValue: "shop",
      notificationsEnabled: false,
    })
    await until(() => lists === 2)
    newRead.resolve(application("03"))
    const saved = await save
    oldRead.resolve(application("02"))
    await oldResult

    const cached = await service.listSystems({ requestId: "cached", refresh: false })
    expect(saved.ok).toBe(true)
    expect(cached).toMatchObject({ ok: true, systems: [{ environment: "03" }] })
    expect(lists).toBe(2)
  })

  test("cancels the underlying read when its final caller leaves", async () => {
    let listStarted = false
    let listCancelled = false
    const run: DeploymentCommandRunner = async (command) => {
      if (!isApplicationList(command)) return healthyCommand(command)
      listStarted = true
      return new Promise((resolve) => {
        command.signal?.addEventListener(
          "abort",
          () => {
            listCancelled = true
            resolve({ ok: false, reason: "cancelled", stdout: "", stderr: "" })
          },
          { once: true },
        )
      })
    }
    const service = createDeploymentService({ store: memoryDeploymentStore(), platform: "darwin", run })
    const controller = new AbortController()
    const read = service.listSystems({ requestId: "cancel", refresh: true }, controller.signal)
    await until(() => listStarted)
    controller.abort()

    expect(await read).toMatchObject({ ok: false, category: "cancelled" })
    expect(listCancelled).toBe(true)
  })

  test("keeps optional Devenv readiness separate from fleet readiness", async () => {
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "linux",
      run: healthyRunner(() => application("02")),
      fileExists: async () => false,
    })
    const result = await service.listSystems({ requestId: "optional", refresh: true })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected fleet")
    expect(result.readiness.fleetReady).toBe(true)
    expect(result.readiness.deploymentReady).toBe(false)
    expect(result.readiness.capabilities.find((item) => item.capability === "bf_deploy_auto_sync")?.status).toBe(
      "unavailable",
    )
  })
})

function healthyRunner(list: () => string | DeploymentCommandResult | Promise<string>): DeploymentCommandRunner {
  return async (command) => {
    if (!isApplicationList(command)) return healthyCommand(command)
    const result = await list()
    return typeof result === "string" ? success(result) : result
  }
}

function healthyCommand(command: DeploymentCommand): DeploymentCommandResult {
  if (command.executable === "argocd" && command.args[0] === "version") return success("argocd: v3.1.7")
  if (command.executable === "argocd" && command.args.includes("--help")) return success(help)
  if (command.executable === "kubectl") return success("dev\n")
  throw new Error(`Unexpected command: ${command.executable} ${command.args.join(" ")}`)
}

function isApplicationList(command: DeploymentCommand) {
  return command.executable === "argocd" && command.args[0] === "app" && !command.args.includes("--help")
}

function application(environment: string) {
  return JSON.stringify([
    {
      metadata: { name: `shop-dev-${environment}`, labels: { app: "shop", environment } },
      spec: { destination: { namespace: environment }, source: { targetRevision: "master" } },
      status: { sync: { status: "Synced" }, health: { status: "Healthy" } },
    },
  ])
}

function commandFailure(stderr: string): DeploymentCommandResult {
  return { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr }
}

function success(stdout: string): DeploymentCommandResult {
  return { ok: true, exitCode: 0, stdout, stderr: "" }
}

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((done) => (resolve = done))
  return { promise, resolve }
}

async function until(condition: () => boolean) {
  while (!condition()) await Promise.resolve()
}
