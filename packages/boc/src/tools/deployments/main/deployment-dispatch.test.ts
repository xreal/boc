import { describe, expect, test } from "bun:test"
import type { DeploymentCommand, DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { memoryDeploymentStore } from "./store"
import { deploymentShopWorkflowYaml, deploymentUnsupportedWorkflowYaml } from "../fixtures/github"

const help = "--core --kube-context string --output string --prompts-enabled --selector string"

describe("deployment preflight and dispatch", () => {
  test("turns auto-sync off with fixed bf-deploy arguments and refreshes the actual state", async () => {
    const commands: DeploymentCommand[] = []
    let automated = true
    const run: DeploymentCommandRunner = async (command) => {
      commands.push(command)
      if (command.executable === "argocd" && command.args[0] === "version") return success("argocd: v3.1.7")
      if (command.executable === "argocd" && command.args.includes("--help")) return success(help)
      if (command.executable === "kubectl") return success("dev\n")
      if (command.executable === "argocd") return success(application("02", "SHOP-42", automated))
      if (command.executable === "python3") {
        automated = false
        return success("updated")
      }
      if (command.executable === "gh") return { ok: false, reason: "not-found", stdout: "", stderr: "" }
      return success("")
    }
    const service = createDeploymentService({
      store: memoryDeploymentStore({
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
      platform: "darwin",
      fileExists: async () => true,
      run,
    })

    const result = await service.turnAutoSyncOff({ environment: "02", expected: "on" })

    expect(result).toMatchObject({ ok: true, systems: [{ environment: "02", autoSync: "off" }] })
    expect(commands.find((command) => command.executable === "python3")).toEqual({
      executable: "python3",
      args: [
        "/work/devenv/src/tools/bf-deploy/__main__.py",
        "argo",
        "--auto-sync",
        "off",
        "-e",
        "02",
        "--deployment",
        "shop",
      ],
      cwd: "/work/devenv/src",
    })
    expect(result.ok && result.readiness.deploymentReady).toBe(false)
  })

  test("rejects stale state and blocking operations before running bf-deploy", async () => {
    const commands: DeploymentCommand[] = []
    const store = memoryDeploymentStore(
      {
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      },
      [{
        id: "active",
        environment: "02",
        branch: "SHOP-42",
        workflows: [],
        state: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }],
    )
    const service = createDeploymentService({
      store,
      platform: "darwin",
      fileExists: async () => true,
      run: combinedRunner(commands, githubState()),
    })

    expect(await service.turnAutoSyncOff({ environment: "02", expected: "on" })).toMatchObject({
      ok: false,
      category: "conflict",
    })
    expect(commands.some((command) => command.executable === "python3")).toBe(false)
  })

  test("refuses bf-deploy when kubectl's inherited current context is not dev", async () => {
    const commands: DeploymentCommand[] = []
    const run: DeploymentCommandRunner = async (command) => {
      commands.push(command)
      if (command.executable === "argocd" && command.args[0] === "version") return success("argocd: v3.1.7")
      if (command.executable === "argocd" && command.args.includes("--help")) return success(help)
      if (command.executable === "kubectl" && command.args.includes("get-contexts")) return success("dev\nprod\n")
      if (command.executable === "kubectl") return success("prod\n")
      if (command.executable === "argocd") return success(application("02", "SHOP-42", true))
      throw new Error(`Unexpected command: ${command.executable}`)
    }
    const service = createDeploymentService({
      store: memoryDeploymentStore({
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
      platform: "darwin",
      fileExists: async () => true,
      run,
    })

    expect(await service.turnAutoSyncOff({ environment: "02", expected: "on" })).toMatchObject({
      ok: false,
      category: "unsafe-target",
      context: { expectedContext: "dev", reason: "bf-deploy-current-context" },
    })
    expect(commands.some((command) => command.executable === "python3")).toBe(false)
  })

  test("blocks deployment preparation while auto-sync is changing and returns unlocked actions afterward", async () => {
    const commands: DeploymentCommand[] = []
    let releaseAdapter: (() => void) | undefined
    let automated = true
    const adapter = new Promise<void>((resolve) => {
      releaseAdapter = resolve
    })
    const run: DeploymentCommandRunner = async (command) => {
      commands.push(command)
      if (command.executable === "argocd" && command.args[0] === "version") return success("argocd: v3.1.7")
      if (command.executable === "argocd" && command.args.includes("--help")) return success(help)
      if (command.executable === "kubectl") return success("dev\n")
      if (command.executable === "argocd") return success(application("02", "SHOP-42", automated))
      if (command.executable === "python3") {
        await adapter
        automated = false
        return success("updated")
      }
      if (command.executable === "gh" && command.args[0] === "--version") return success("gh version 2.100.0")
      if (command.executable === "gh" && command.args[0] === "auth") return success("Logged in to github.com")
      if (command.executable === "gh" && command.args[1] === "repos/bergfreunde/shop") {
        return success(JSON.stringify({ full_name: "bergfreunde/shop" }))
      }
      if (command.executable === "gh" && command.args[0] === "workflow" && command.args[1] === "list") {
        return success(JSON.stringify([{ name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" }]))
      }
      throw new Error(`Unexpected command: ${command.executable}`)
    }
    const service = createDeploymentService({
      store: memoryDeploymentStore({
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
      platform: "darwin",
      fileExists: async () => true,
      run,
    })

    const changing = service.turnAutoSyncOff({ environment: "02", expected: "on" })
    while (!commands.some((command) => command.executable === "python3")) await Promise.resolve()
    expect(
      await service.prepareDeployment({
        environment: "02",
        ref: "SHOP-42",
        workflows: [{ filename: "app-shop.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "conflict" })
    releaseAdapter?.()
    const result = await changing
    expect(result).toMatchObject({ ok: true, systems: [{ environment: "02", autoSync: "off" }] })
    expect(result.ok && result.systems[0]?.allowedActions).toContain("deploy")
  })

  test("prepares a normalized single-use plan and rejects expiry, replay, and draft replacement", async () => {
    let now = 1_000
    let ids = 0
    const commands: DeploymentCommand[] = []
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      now: () => now,
      createId: () => `id-${++ids}`,
      run: combinedRunner(commands, githubState()),
    })

    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: { perform_tests: false } }],
    })
    expect(prepared).toMatchObject({
      ok: true,
      plan: {
        preflightId: "id-1",
        kind: "deploy",
        environment: "02",
        ref: "SHOP-42",
        workflows: [
          {
            filename: "app-shop.yml",
            inputs: { perform_tests: false, force_rebuild: false, run_regression_tests: false },
          },
        ],
      },
    })
    if (!prepared.ok) throw new Error("expected plan")
    expect(prepared.plan.workflows[0]?.inputs).not.toHaveProperty("environment")

    now = 1_000 + 5 * 60 * 1000
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({
      ok: false,
      category: "timeout",
    })

    const fresh = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: { perform_tests: true } }],
    })
    if (!fresh.ok) throw new Error("expected fresh plan")
    const dispatched = await service.dispatchPrepared({ preflightId: fresh.plan.preflightId })
    expect(dispatched).toMatchObject({
      ok: true,
      operation: { state: "queued", environment: "02", branch: "SHOP-42" },
    })
    expect(await service.dispatchPrepared({ preflightId: fresh.plan.preflightId })).toMatchObject({
      ok: false,
      category: "not-found",
    })
  })

  test("invalidates prepared plans when settings change and never accepts a renderer-supplied repository", async () => {
    const commands: DeploymentCommand[] = []
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "linux",
      createId: () => "plan-1",
      run: combinedRunner(commands, githubState()),
    })
    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    expect(prepared.ok).toBe(true)
    await service.saveSettings({
      applicationLabelKey: "app",
      applicationLabelValue: "shop",
      notificationsEnabled: true,
    })
    expect(await service.dispatchPrepared({ preflightId: "plan-1" })).toMatchObject({
      ok: false,
      category: "not-found",
    })
    expect(commands.some((command) => command.args.includes("bergfreunde/shop"))).toBe(true)
    expect(commands.some((command) => command.args.includes("auth") && command.args.includes("token"))).toBe(false)
  })

  test("writes dispatching before invoking gh and never retries a failed workflow", async () => {
    const commands: DeploymentCommand[] = []
    let persistCount = 0
    const store = memoryDeploymentStore()
    const wrapped = {
      ...store,
      writeOperations: (operations: Parameters<typeof store.writeOperations>[0]) => {
        persistCount += 1
        store.writeOperations(operations)
      },
    }
    const state = githubState()
    state.run = { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "HTTP 403 dispatch rejected secret" }
    const service = createDeploymentService({
      store: wrapped,
      platform: "darwin",
      createId: () => "op-1",
      run: combinedRunner(commands, state),
    })

    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    if (!prepared.ok) throw new Error("expected plan")
    const result = await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })
    expect(result).toMatchObject({ ok: true, operation: { id: "op-1", state: "failure" } })
    expect(persistCount).toBeGreaterThanOrEqual(2)
    expect(commands.filter((command) => command.args[0] === "workflow" && command.args[1] === "run")).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain("secret")
    expect(commands.find((command) => command.args[1] === "run")?.stdin).toContain('"environment":"02"')
  })

  test("rejects missing workflows, required unsupported inputs, unsafe targets, and duplicate active operations", async () => {
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      createId: () => "dup",
      run: combinedRunner([], githubState()),
    })
    expect(
      await service.prepareDeployment({
        environment: "02",
        ref: "SHOP-42",
        workflows: [{ filename: "app-missing.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "not-found" })

    const unsupported = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: combinedRunner([], {
        ...githubState(),
        yaml: deploymentUnsupportedWorkflowYaml,
        workflows: [{ name: "Billing", path: ".github/workflows/app-billing.yml", state: "active" }],
      }),
    })
    expect(
      await unsupported.prepareDeployment({
        environment: "02",
        ref: "SHOP-42",
        workflows: [{ filename: "app-billing.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "invalid-input" })

    const ready = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      createId: () => "active",
      run: combinedRunner([], githubState()),
    })
    const first = await ready.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    if (!first.ok) throw new Error("expected first plan")
    await ready.dispatchPrepared({ preflightId: first.plan.preflightId })
    expect(
      await ready.prepareDeployment({
        environment: "02",
        ref: "SHOP-42",
        workflows: [{ filename: "app-shop.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "conflict" })
  })

  test("records partial dispatch without retrying accepted workflows", async () => {
    let runs = 0
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "linux",
      createId: () => `partial-${runs}`,
      run: combinedRunner([], {
        ...githubState(),
        workflows: [
          { name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" },
          { name: "Admin", path: ".github/workflows/app-admin.yml", state: "active" },
        ],
        yamlByFile: {
          "app-shop.yml": deploymentShopWorkflowYaml,
          "app-admin.yml": "on: workflow_dispatch\n",
        },
        run: () => {
          runs += 1
          if (runs === 1) {
            return success("https://github.com/bergfreunde/shop/actions/runs/11")
          }
          return { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "HTTP 403 second rejected" }
        },
      }),
    })
    const prepared = await service.prepareDeployment({
      environment: "03",
      ref: "SHOP-42",
      workflows: [
        { filename: "app-shop.yml", inputs: {} },
        { filename: "app-admin.yml", inputs: {} },
      ],
    })
    if (!prepared.ok) throw new Error("expected plan")
    const dispatched = await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })
    expect(dispatched).toMatchObject({ ok: true, operation: { state: "queued" } })
    if (!dispatched.ok) throw new Error("expected operation")
    expect(dispatched.operation.workflows).toEqual([
      {
        filename: "app-shop.yml",
        state: "queued",
        runId: "11",
        runUrl: "https://github.com/bergfreunde/shop/actions/runs/11",
      },
      { filename: "app-admin.yml", state: "failure" },
    ])
    expect(runs).toBe(2)
    expect(
      await service.prepareDeployment({
        environment: "03",
        ref: "SHOP-42",
        workflows: [{ filename: "app-shop.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "conflict" })
  })

  test("concurrent dispatches consume a prepared plan only once", async () => {
    const commands: DeploymentCommand[] = []
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: combinedRunner(commands, githubState()),
    })
    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    if (!prepared.ok) throw new Error("expected plan")
    const results = await Promise.all([
      service.dispatchPrepared({ preflightId: prepared.plan.preflightId }),
      service.dispatchPrepared({ preflightId: prepared.plan.preflightId }),
    ])
    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(commands.filter((command) => command.args[1] === "run")).toHaveLength(1)
  })

  test("a dispatch timeout keeps the environment blocked", async () => {
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: combinedRunner(
        [],
        githubState({
          run: { ok: false, reason: "timeout", stdout: "", stderr: "" },
        }),
      ),
    })
    const draft = {
      environment: "02" as const,
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml" as const, inputs: {} }],
    }
    const prepared = await service.prepareDeployment(draft)
    if (!prepared.ok) throw new Error("expected plan")
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({
      ok: true,
      operation: { state: "unknown" },
    })
    expect(await service.prepareDeployment(draft)).toMatchObject({ ok: false, category: "conflict" })
  })

  test("concurrent deployments to different environments retain both operation records", async () => {
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: combinedRunner([], githubState()),
    })
    const plans = await Promise.all(
      (["02", "03"] as const).map((environment) =>
        service.prepareDeployment({
          environment,
          ref: "SHOP-42",
          workflows: [{ filename: "app-shop.yml", inputs: {} }],
        }),
      ),
    )
    await Promise.all(
      plans.map((result) => {
        if (!result.ok) throw new Error("expected plan")
        return service.dispatchPrepared({ preflightId: result.plan.preflightId })
      }),
    )
    expect(
      service
        .listOperations()
        .operations.map((operation) => operation.environment)
        .sort(),
    ).toEqual(["02", "03"])
    expect(service.listOperations().operations.every((operation) => operation.state === "queued")).toBe(true)
  })

  test("invalidation during dispatch verification prevents the external mutation", async () => {
    const commands: DeploymentCommand[] = []
    const runner = combinedRunner(commands, githubState())
    let invalidate = () => {}
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: async (command) => {
        if (command.executable === "kubectl") invalidate()
        return runner(command)
      },
    })
    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    if (!prepared.ok) throw new Error("expected plan")
    invalidate = service.invalidate
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({ ok: false })
    expect(commands.filter((command) => command.args[1] === "run")).toHaveLength(0)
  })

  test("reset uses master and app-shop on the same prepare/dispatch machinery", async () => {
    const commands: DeploymentCommand[] = []
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      createId: () => "reset-1",
      run: combinedRunner(commands, githubState()),
    })
    const prepared = await service.prepareReset({ environment: "02" })
    expect(prepared).toMatchObject({
      ok: true,
      plan: {
        kind: "reset",
        ref: "master",
        workflows: [
          {
            filename: "app-shop.yml",
            inputs: { perform_tests: true, force_rebuild: false, run_regression_tests: false },
          },
        ],
      },
    })
    if (!prepared.ok) throw new Error("expected reset plan")
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({
      ok: false,
      category: "invalid-input",
    })
    const dispatched = await service.dispatchPreparedReset({ preflightId: prepared.plan.preflightId })
    expect(dispatched).toMatchObject({ ok: true, operation: { state: "queued", branch: "master" } })
    const run = commands.find((command) => command.args[1] === "run")
    expect(run?.args).toContain("master")
    expect(run?.args).toContain("app-shop.yml")
  })

  test("rechecks the exact Argo dev target immediately before dispatch", async () => {
    const commands: DeploymentCommand[] = []
    let contexts = "dev\n"
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      createId: () => "safe",
      run: combinedRunner(commands, {
        ...githubState(),
        contexts: () => contexts,
      }),
    })
    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    if (!prepared.ok) throw new Error("expected plan")
    contexts = "staging\n"
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({
      ok: false,
      category: "unsafe-target",
    })
    expect(commands.filter((command) => command.executable === "kubectl")).toHaveLength(2)
    expect(commands.some((command) => command.args[1] === "run")).toBe(false)
  })

  test("redeploys only the unchanged non-master branch after two fresh Argo reads", async () => {
    const commands: DeploymentCommand[] = []
    let branch = "SHOP-42"
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      createId: () => "redeploy-1",
      run: combinedRunner(commands, { ...githubState(), applicationBranch: () => branch }),
    })
    const prepared = await service.prepareDeployment({
      environment: "02",
      ref: "SHOP-42",
      expectedBranch: "SHOP-42",
      workflows: [{ filename: "app-shop.yml", inputs: {} }],
    })
    expect(prepared).toMatchObject({ ok: true, plan: { kind: "redeploy", ref: "SHOP-42" } })
    if (!prepared.ok) throw new Error("expected redeploy plan")

    branch = "SHOP-43"
    expect(await service.dispatchPrepared({ preflightId: prepared.plan.preflightId })).toMatchObject({
      ok: false,
      category: "conflict",
    })
    expect(
      commands.filter(
        (command) => command.executable === "argocd" && command.args[1] === "list" && !command.args.includes("--help"),
      ),
    ).toHaveLength(2)
    expect(commands.some((command) => command.args[1] === "run")).toBe(false)
  })

  test("rejects master, unknown, and reserved redeploy targets", async () => {
    const service = createDeploymentService({
      store: memoryDeploymentStore(),
      platform: "darwin",
      run: combinedRunner([], githubState()),
    })
    const draft = { workflows: [{ filename: "app-shop.yml" as const, inputs: {} }] }
    expect(
      await service.prepareDeployment({ environment: "02", ref: "master", expectedBranch: "master", ...draft }),
    ).toMatchObject({ ok: false, category: "unsafe-target" })
    expect(
      await service.prepareDeployment({ environment: "02", ref: "SHOP-42", expectedBranch: "SHOP-42", ...draft }),
    ).toMatchObject({ ok: false, category: "conflict" })
    expect(
      await service.prepareDeployment({ environment: "20", ref: "SHOP-42", expectedBranch: "SHOP-42", ...draft }),
    ).toMatchObject({ ok: false, category: "unsafe-target" })
    expect(
      await service.prepareDeployment({ environment: "02", ref: "SHOP-43", expectedBranch: "SHOP-42", ...draft }),
    ).toMatchObject({ ok: false, category: "invalid-input" })
  })
})

type GithubState = {
  branches?: string[]
  workflows?: Array<{ name: string; path: string; state: string }>
  yaml?: string
  yamlByFile?: Record<string, string>
  run?: DeploymentCommandResult | (() => DeploymentCommandResult)
  contexts?: () => string
  applicationBranch?: () => string | undefined
}

function githubState(overrides: GithubState = {}): GithubState {
  return {
    branches: ["SHOP-42", "master"],
    workflows: [{ name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" }],
    yaml: deploymentShopWorkflowYaml,
    run: success("https://github.com/bergfreunde/shop/actions/runs/99"),
    ...overrides,
  }
}

function combinedRunner(commands: DeploymentCommand[], github: GithubState): DeploymentCommandRunner {
  return async (command) => {
    commands.push(command)
    if (command.executable === "argocd" && command.args[0] === "version") return success("argocd: v3.1.7")
    if (command.executable === "argocd" && command.args.includes("--help")) return success(help)
    if (command.executable === "kubectl") return success(github.contexts?.() ?? "dev\n")
    if (command.executable === "argocd") return success(application("02", github.applicationBranch?.() ?? "master"))
    if (command.executable !== "gh") throw new Error(`Unexpected command: ${command.executable}`)
    if (command.args[0] === "--version") return success("gh version 2.100.0")
    if (command.args[0] === "auth") return success("Logged in to github.com")
    if (command.args[0] === "api" && command.args[1] === `repos/bergfreunde/shop`) {
      return success(JSON.stringify({ full_name: "bergfreunde/shop" }))
    }
    if (command.args[0] === "api" && command.args[1] === "graphql") {
      return success(
        JSON.stringify({
          data: { repository: { refs: { nodes: (github.branches ?? []).map((name) => ({ name })) } } },
        }),
      )
    }
    if (command.args[0] === "workflow" && command.args[1] === "list") {
      return success(JSON.stringify(github.workflows ?? []))
    }
    if (command.args[0] === "workflow" && command.args[1] === "view") {
      const filename = command.args[2] ?? ""
      return success(github.yamlByFile?.[filename] ?? github.yaml ?? "")
    }
    if (command.args[0] === "workflow" && command.args[1] === "run") {
      return typeof github.run === "function" ? github.run() : (github.run ?? success(""))
    }
    throw new Error(`Unexpected gh ${command.args.join(" ")}`)
  }
}

function application(environment: string, branch: string, automated = false) {
  return JSON.stringify([
    {
      metadata: { name: `shop-dev-${environment}`, labels: { app: "shop", environment } },
      spec: {
        destination: { namespace: environment },
        source: { targetRevision: branch },
        ...(automated ? { syncPolicy: { automated: { prune: true } } } : {}),
      },
      status: { sync: { status: "Synced" }, health: { status: "Healthy" } },
    },
  ])
}

function success(stdout: string): DeploymentCommandResult {
  return { ok: true, exitCode: 0, stdout, stderr: "" }
}
