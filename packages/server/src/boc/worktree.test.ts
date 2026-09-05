import { expect } from "bun:test"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import path from "node:path"
import { Context, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"
import { tmpdirScoped } from "../../../core/test/fixture/tmpdir"
import { initRepo } from "../../../core/test/fixture/git"
import { it } from "../../../core/test/lib/effect"
import { createRoutes } from "../routes"

it.live("exposes Rift capability only from a Boc backend and registered project", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-rift-capability-")
    const upstream = yield* backend(tmp.path)
    expect(yield* upstream.request(capabilityUrl(tmp.path))).toMatchObject({
      available: false,
      backend: "boc/rift",
      reason: "backend-unavailable",
    })

    const boc = yield* backend(tmp.path, "boc")
    expect(yield* boc.request(capabilityUrl(tmp.path))).toMatchObject({
      available: false,
      backend: "boc/rift",
      reason: "project-mismatch",
    })

    yield* Effect.promise(() => initRepo(tmp.path))
    const project = yield* boc.projects.resolve(AbsolutePath.make(tmp.path))
    const url = capabilityUrl(tmp.path, project.id)
    expect(yield* boc.request(url)).toMatchObject({ reason: "project-mismatch" })
    url.searchParams.set("directory", path.dirname(tmp.path))
    const capability = yield* boc.request(url)
    expect(capability).toMatchObject({ backend: "boc/rift" })
    expect(capability).not.toMatchObject({ reason: "project-mismatch" })

    expect(yield* upstream.request("/api/boc/worktree/rift-trash")).toEqual({ checkouts: 0 })
    expect(yield* upstream.request("/api/boc/worktree/rift-trash/cleanup", "POST")).toEqual({
      completed: false,
      checkouts: 0,
    })
  }),
)

function capabilityUrl(directory: string, projectID = "project") {
  const url = new URL(`/api/boc/worktree/${projectID}/rift-capability`, "http://opencode.local")
  url.searchParams.set("source", directory)
  url.searchParams.set("directory", directory)
  return url
}

const backend = Effect.fnUntraced(function* (directory: string, channel?: string) {
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
  expect(
    Context.get(context, SdkPlugins.Service)
      .all()
      .some((plugin) => plugin.id === "boc.worktrees"),
  ).toBe(channel === "boc")
  const request = Effect.fnUntraced(function* (target: string | URL, method = "GET") {
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
  return { request, projects: Context.get(context, Project.Service) }
})
