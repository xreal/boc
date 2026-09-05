import { expect } from "bun:test"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"
import { tmpdirScoped } from "../../../core/test/fixture/tmpdir"
import { it } from "../../../core/test/lib/effect"
import { createRoutes } from "../routes"

it.live("exposes Rift capability only from a Boc backend and registered project", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-rift-capability-")
    const upstream = yield* requestCapability(tmp.path)
    expect(upstream).toMatchObject({ available: false, backend: "boc/rift", reason: "backend-unavailable" })

    const boc = yield* requestCapability(tmp.path, "boc")
    expect(boc).toMatchObject({ available: false, backend: "boc/rift", reason: "project-mismatch" })

    expect(yield* requestJson(tmp.path, "/api/boc/worktree/rift-trash")).toEqual({ checkouts: 0 })
    expect(yield* requestJson(tmp.path, "/api/boc/worktree/rift-trash/cleanup", "POST")).toEqual({
      completed: false,
      checkouts: 0,
    })
  }),
)

const requestCapability = Effect.fnUntraced(function* (directory: string, channel?: string) {
  const url = new URL("/api/boc/worktree/project/rift-capability", "http://opencode.local")
  url.searchParams.set("source", directory)
  url.searchParams.set("directory", directory)
  return yield* requestJson(directory, url, "GET", channel)
})

const requestJson = Effect.fnUntraced(function* (
  directory: string,
  target: string | URL,
  method = "GET",
  channel?: string,
) {
  const context = yield* Layer.build(
    createRoutes({
      password: "secret",
      app: { channel, version: "test-version" },
      database: { path: ":memory:" },
      config: { directory, project: false },
      fs: { filewatcher: false },
      models: { fetch: false },
    }).pipe(Layer.provide(HttpServer.layerServices)),
  )
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  const response = yield* Effect.promise((signal) =>
    handler(
      new Request(new URL(target, "http://opencode.local"), {
        method,
        headers: { authorization: `Basic ${btoa("opencode:secret")}` },
        signal,
      }),
    ),
  )
  expect(response.status).toBe(200)
  return yield* Effect.promise(() => response.json())
})
