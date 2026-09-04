import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { createBocDesktopAPI, type BocDesktopInvoke } from "./renderer/api"
import { BocDesktopRpcs } from "./shared/rpcs"
import { exampleHandlers, ExampleRpcs } from "../tools/__fixtures__/example/rpcs"
import { createDeploymentService } from "../tools/deployments/main/deployment-service"
import { createDeploymentHandlers } from "../tools/deployments/main/handlers"
import { memoryDeploymentStore } from "../tools/deployments/main/store"
import { createJiraHandlers } from "../tools/jira/main/handlers"
import { memoryVault } from "../tools/jira/main/credentials"
import { memoryJiraStore } from "../tools/jira/main/store"

test("composes RPC groups and handler layers", async () => {
  const rpcs = BocDesktopRpcs.merge(ExampleRpcs)
  const handlers = Layer.mergeAll(
    createJiraHandlers({
      store: memoryJiraStore(),
      vault: memoryVault(),
      fetch: async () => new Response(null, { status: 500 }),
    }),
    createDeploymentHandlers({
      service: createDeploymentService({
        store: memoryDeploymentStore(),
        run: async () => ({ ok: false, reason: "not-found", stdout: "", stderr: "" }),
        platform: "win32",
      }),
    }),
    exampleHandlers,
  )
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(rpcs)
        const connection = yield* client.BocJiraGetConnectionStatus()
        const deployment = yield* client.BocDeploymentsGetSettings()
        const ping = yield* client.BocExamplePing()
        return { connection, deployment, ping }
      }),
    ).pipe(Effect.provide(handlers)),
  )

  expect(result).toEqual({
    connection: { status: "not-configured", encryptionAvailable: true },
    deployment: {
      applicationLabelKey: "app",
      applicationLabelValue: "shop",
      notificationsEnabled: true,
    },
    ping: "pong",
  })
})

test("maps the renderer API to the typed Jira RPCs", async () => {
  const called: string[] = []
  const invoke = (async (tag: string) => {
    called.push(tag)
    if (
      tag === "BocJiraGetConnectionStatus" ||
      tag === "BocJiraDisconnect" ||
      tag === "BocJiraCancelBoardRead" ||
      tag === "BocJiraCancelIssueRead"
    ) {
      if (tag.startsWith("BocJiraCancel")) return undefined
      return Schema.decodeUnknownSync(
        Schema.Struct({
          status: Schema.Literal("not-configured"),
          encryptionAvailable: Schema.Boolean,
        }),
      )({ status: "not-configured", encryptionAvailable: true })
    }
    if (tag === "BocJiraGetPreferences" || tag === "BocJiraSavePreferences") {
      return Schema.decodeUnknownSync(
        Schema.Struct({
          savedBoards: Schema.Array(
            Schema.Struct({
              id: Schema.Number,
              name: Schema.String,
              type: Schema.Literals(["scrum", "kanban"]),
            }),
          ),
        }),
      )({ savedBoards: [] })
    }
    if (tag === "BocJiraListBoards") {
      return Schema.decodeUnknownSync(
        Schema.Struct({
          ok: Schema.Literal(true),
          boards: Schema.Array(
            Schema.Struct({
              id: Schema.Number,
              name: Schema.String,
              type: Schema.Literals(["scrum", "kanban"]),
            }),
          ),
        }),
      )({ ok: true, boards: [] })
    }
    if (tag === "BocJiraGetBoard" || tag === "BocJiraListIssues" || tag === "BocJiraGetIssue") {
      return Schema.decodeUnknownSync(
        Schema.Struct({
          ok: Schema.Literal(false),
          category: Schema.Literal("auth"),
        }),
      )({ ok: false, category: "auth" })
    }
    return Schema.decodeUnknownSync(
      Schema.Struct({
        ok: Schema.Literal(true),
        status: Schema.Literal("connected"),
        site: Schema.String,
        email: Schema.String,
        displayName: Schema.String,
      }),
    )({
      ok: true,
      status: "connected",
      site: "acme",
      email: "mia@example.com",
      displayName: "Mia Krystof",
    })
  }) as BocDesktopInvoke
  const api = createBocDesktopAPI(invoke)

  await expect(api.jira.getConnectionStatus()).resolves.toEqual({
    status: "not-configured",
    encryptionAvailable: true,
  })
  await expect(api.jira.testConnection({ site: "acme", email: "mia@example.com", token: "secret" })).resolves.toEqual({
    ok: true,
    status: "connected",
    site: "acme",
    email: "mia@example.com",
    displayName: "Mia Krystof",
  })
  await expect(api.jira.saveConnection({ site: "acme", email: "mia@example.com", token: "secret" })).resolves.toEqual({
    ok: true,
    status: "connected",
    site: "acme",
    email: "mia@example.com",
    displayName: "Mia Krystof",
  })
  await expect(api.jira.disconnect()).resolves.toEqual({
    status: "not-configured",
    encryptionAvailable: true,
  })
  await expect(api.jira.listBoards({ requestId: "boards" })).resolves.toEqual({ ok: true, boards: [] })
  await expect(api.jira.getBoard({ requestId: "board", boardId: 1 })).resolves.toEqual({
    ok: false,
    category: "auth",
  })
  await expect(api.jira.listIssues({ requestId: "issues", boardId: 1 })).resolves.toEqual({
    ok: false,
    category: "auth",
  })
  await expect(api.jira.getIssue({ requestId: "issue", issueKey: "PLAT-1" })).resolves.toEqual({
    ok: false,
    category: "auth",
  })
  await expect(api.jira.cancelBoardRead({ requestId: "board" })).resolves.toBeUndefined()
  await expect(api.jira.cancelIssueRead({ requestId: "issue" })).resolves.toBeUndefined()
  await expect(api.jira.getPreferences()).resolves.toEqual({ savedBoards: [] })
  await expect(api.jira.savePreferences({ savedBoards: [] })).resolves.toEqual({ savedBoards: [] })
  expect(called).toEqual([
    "BocJiraGetConnectionStatus",
    "BocJiraTestConnection",
    "BocJiraSaveConnection",
    "BocJiraDisconnect",
    "BocJiraListBoards",
    "BocJiraGetBoard",
    "BocJiraListIssues",
    "BocJiraGetIssue",
    "BocJiraCancelBoardRead",
    "BocJiraCancelIssueRead",
    "BocJiraGetPreferences",
    "BocJiraSavePreferences",
  ])
})

test("maps the renderer API to every typed Deployment RPC", async () => {
  const called: Array<{ tag: string; payload: unknown }> = []
  const invoke = (async (tag: string, payload?: unknown) => {
    called.push({ tag, payload })
    return undefined
  }) as BocDesktopInvoke
  const api = createBocDesktopAPI(invoke)
  const settings = {
    applicationLabelKey: "app",
    applicationLabelValue: "shop",
    notificationsEnabled: true,
  }

  await api.deployments.getWorkspace()
  await api.deployments.listSystems({ requestId: "fleet", refresh: true })
  await api.deployments.cancelSystemsRead({ requestId: "fleet" })
  await api.deployments.getSettings()
  await api.deployments.saveSettings(settings)
  await api.deployments.checkReadiness()
  await api.deployments.listBranches({ requestId: "branch", query: "SHOP" })
  await api.deployments.listWorkflowTargets({ requestId: "workflow", refresh: false })
  await api.deployments.listOperations()
  await api.deployments.prepareDeployment({
    environment: "02",
    ref: "SHOP-42",
    workflows: [{ filename: "app-shop.yml", inputs: {} }],
  })
  await api.deployments.dispatchPrepared({ preflightId: "deploy" })
  await api.deployments.prepareReset({ environment: "02" })
  await api.deployments.dispatchPreparedReset({ preflightId: "reset" })
  await api.deployments.redeployBranch({ environment: "02", expectedBranch: "SHOP-42", confirmed: true })
  await api.deployments.setAutoSync({ environment: "02", expected: "off", enabled: true, confirmed: true })

  expect(called.map((entry) => entry.tag)).toEqual([
    "BocDeploymentsGetWorkspace",
    "BocDeploymentsListSystems",
    "BocDeploymentsCancelSystemsRead",
    "BocDeploymentsGetSettings",
    "BocDeploymentsSaveSettings",
    "BocDeploymentsCheckReadiness",
    "BocDeploymentsListBranches",
    "BocDeploymentsListWorkflowTargets",
    "BocDeploymentsListOperations",
    "BocDeploymentsPrepareDeployment",
    "BocDeploymentsDispatchPrepared",
    "BocDeploymentsPrepareReset",
    "BocDeploymentsDispatchPreparedReset",
    "BocDeploymentsRedeployBranch",
    "BocDeploymentsSetAutoSync",
  ])
})
