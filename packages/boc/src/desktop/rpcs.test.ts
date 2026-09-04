import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { bocDesktopHandlers } from "./main/index"
import { createBocDesktopAPI, type BocDesktopInvoke } from "./renderer/api"
import { BocDesktopRpcs } from "./shared/rpcs"
import { exampleHandlers, ExampleRpcs } from "../tools/__fixtures__/example/rpcs"

test("composes RPC groups and handler layers", async () => {
  const rpcs = BocDesktopRpcs.merge(ExampleRpcs)
  const handlers = Layer.mergeAll(bocDesktopHandlers, exampleHandlers)
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

  expect(result).toEqual({ connection: { status: "not-configured" }, ping: "pong" })
})

test("maps the renderer API to the typed Jira RPC", async () => {
  const called: string[] = []
  const invoke = (async (tag: string) => {
    called.push(tag)
    return Schema.decodeUnknownSync(Schema.Struct({ status: Schema.Literal("not-configured") }))({
      status: "not-configured",
    })
  }) as BocDesktopInvoke
  const api = createBocDesktopAPI(invoke)

  await expect(api.jira.getConnectionStatus()).resolves.toEqual({ status: "not-configured" })
  expect(called).toEqual(["BocJiraGetConnectionStatus"])
})
