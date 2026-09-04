import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { createBocDesktopAPI, type BocDesktopInvoke } from "./renderer/api"
import { BocDesktopRpcs } from "./shared/rpcs"
import { exampleHandlers, ExampleRpcs } from "../tools/__fixtures__/example/rpcs"
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
    exampleHandlers,
  )
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(rpcs)
        const connection = yield* client.BocJiraGetConnectionStatus()
        const ping = yield* client.BocExamplePing()
        return { connection, ping }
      }),
    ).pipe(Effect.provide(handlers)),
  )

  expect(result).toEqual({
    connection: { status: "not-configured", encryptionAvailable: true },
    ping: "pong",
  })
})

test("maps the renderer API to the typed Jira RPCs", async () => {
  const called: string[] = []
  const invoke = (async (tag: string) => {
    called.push(tag)
    if (tag === "BocJiraGetConnectionStatus" || tag === "BocJiraDisconnect") {
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
  await expect(
    api.jira.testConnection({ site: "acme", email: "mia@example.com", token: "secret" }),
  ).resolves.toEqual({
    ok: true,
    status: "connected",
    site: "acme",
    email: "mia@example.com",
    displayName: "Mia Krystof",
  })
  await expect(
    api.jira.saveConnection({ site: "acme", email: "mia@example.com", token: "secret" }),
  ).resolves.toEqual({
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
  await expect(api.jira.listBoards()).resolves.toEqual({ ok: true, boards: [] })
  await expect(api.jira.getPreferences()).resolves.toEqual({ savedBoards: [] })
  await expect(api.jira.savePreferences({ savedBoards: [] })).resolves.toEqual({ savedBoards: [] })
  expect(called).toEqual([
    "BocJiraGetConnectionStatus",
    "BocJiraTestConnection",
    "BocJiraSaveConnection",
    "BocJiraDisconnect",
    "BocJiraListBoards",
    "BocJiraGetPreferences",
    "BocJiraSavePreferences",
  ])
})
