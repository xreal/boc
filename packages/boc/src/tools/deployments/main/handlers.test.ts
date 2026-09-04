import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { DeploymentRpcs } from "../rpcs"
import type { DeploymentCommandRunner } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { createDeploymentHandlers } from "./handlers"
import { memoryDeploymentStore } from "./store"

describe("deployment RPC handlers", () => {
  test("serves the read-only workspace through the complete typed group", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(DeploymentRpcs)
          const workspace = yield* client.BocDeploymentsGetWorkspace()
          const operations = yield* client.BocDeploymentsListOperations()
          const unavailable = yield* client.BocDeploymentsPrepareDeployment({
            environment: "02",
            ref: "SHOP-42-read-only",
            workflows: [{ filename: "app-shop.yml", inputs: {} }],
          })
          return { workspace, operations, unavailable }
        }),
      ).pipe(Effect.provide(createDeploymentHandlers({ service: createDeploymentService(healthyRuntime()) }))),
    )

    expect(result.workspace).toMatchObject({
      ok: true,
      workspace: {
        systems: [{ environment: "02" }],
        readiness: { fleetReady: true, deploymentReady: false },
      },
    })
    expect(result.operations).toEqual({ ok: true, operations: [] })
    expect(result.unavailable).toMatchObject({
      ok: false,
      category: "not-found",
      capability: "github_workflow_dispatch",
    })
  })

  test("rejects unsafe settings in main without persisting them", async () => {
    const store = memoryDeploymentStore()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(DeploymentRpcs)
          return yield* client.BocDeploymentsSaveSettings({
            argoProject: "shop-production",
            applicationLabelKey: "app",
            applicationLabelValue: "shop",
            notificationsEnabled: true,
          })
        }),
      ).pipe(
        Effect.provide(
          createDeploymentHandlers({
            service: createDeploymentService({ ...healthyRuntime(), store }),
          }),
        ),
      ),
    )

    expect(result).toMatchObject({ ok: false, category: "unsafe-target" })
    expect(store.readSettings()).toBeUndefined()
  })
})

function healthyRuntime(): Parameters<typeof createDeploymentService>[0] {
  const run: DeploymentCommandRunner = async (command) => {
    if (command.executable === "argocd" && command.args[0] === "version") {
      return { ok: true, exitCode: 0, stdout: "argocd: v3.1.7", stderr: "" }
    }
    if (command.executable === "argocd" && command.args.includes("--help")) {
      return {
        ok: true,
        exitCode: 0,
        stdout: "--core --kube-context string --output string --prompts-enabled --selector string",
        stderr: "",
      }
    }
    if (command.executable === "kubectl") {
      return { ok: true, exitCode: 0, stdout: "dev\n", stderr: "" }
    }
    return {
      ok: true,
      exitCode: 0,
      stdout: JSON.stringify([
        {
          metadata: { name: "shop-dev-02", labels: { environment: "02" } },
          spec: { destination: { namespace: "02" }, source: { targetRevision: "master" } },
          status: { sync: { status: "Synced" }, health: { status: "Healthy" } },
        },
      ]),
      stderr: "",
    }
  }
  return { store: memoryDeploymentStore(), platform: "darwin", run }
}
