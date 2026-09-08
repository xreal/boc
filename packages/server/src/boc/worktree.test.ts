import { expect } from "bun:test"
import { $ } from "bun"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { State as WorktreePreparationState } from "@opencode-ai/schema/boc/worktree-preparation"
import { Session } from "@opencode-ai/schema/session"
import { BocEnvironments } from "@boc/extensions/environments/server"
import path from "node:path"
import fs from "node:fs/promises"
import { Context, Effect, Layer, Schedule, Schema } from "effect"
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
    expect(yield* boc.request(environmentUrl(tmp.path, "project"))).toMatchObject({
      availability: { available: false, reason: "checkout-not-registered" },
    })

    yield* Effect.promise(() => initRepo(tmp.path))
    const project = yield* boc.projects.resolve(AbsolutePath.make(tmp.path))
    const url = capabilityUrl(tmp.path, project.id)
    expect(yield* boc.request(url)).toMatchObject({ reason: "project-mismatch" })
    url.searchParams.set("directory", path.dirname(tmp.path))
    const capability = yield* boc.request(url)
    expect(capability).toMatchObject({ backend: "boc/rift" })
    expect(capability).not.toMatchObject({ reason: "project-mismatch" })

    const operationID = Session.ID.create()
    const preparationRoot = path.join(path.dirname(tmp.path), `${path.basename(tmp.path)}-preparations`)
    yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(preparationRoot, { recursive: true, force: true })))
    const prepareUrl = new URL("/api/boc/worktree/prepare", "http://opencode.local")
    prepareUrl.searchParams.set("location[directory]", tmp.path)
    expect(
      yield* boc
        .request(prepareUrl, "POST", {
          operationID,
          worktree: { strategy: "git", from: tmp.path, directory: preparationRoot, name: "tracked" },
        })
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(WorktreePreparationState))),
    ).toMatchObject({ operationID })
    const completed = yield* boc.request(`/api/boc/worktree/preparation/${operationID}`).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.NullOr(WorktreePreparationState))),
      Effect.filterOrFail(
        (state) => state?.status === "succeeded",
        () => new Error("Preparation is still running"),
      ),
      Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 50 }),
    )
    expect(completed).toMatchObject({ phase: "creating-checkout", directory: path.join(preparationRoot, "tracked") })

    expect(yield* boc.request(environmentUrl(tmp.path, project.id))).toMatchObject({
      availability: { available: false, reason: "checkout-not-isolated" },
    })
    const linked = path.join(path.dirname(tmp.path), `${path.basename(tmp.path)}-linked`)
    yield* Effect.promise(() => $`git worktree add --detach ${linked}`.cwd(tmp.path).quiet())
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => $`git worktree remove --force ${linked}`.cwd(tmp.path).quiet()),
    )
    const linkedProject = yield* boc.projects.resolve(AbsolutePath.make(linked))
    expect(linkedProject.id).toBe(project.id)
    expect(yield* boc.request(environmentUrl(linked, project.id))).toMatchObject({
      directory: linked,
      availability: { available: true, strategy: "git" },
      stack: { status: "unconfigured" },
    })

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

function environmentUrl(directory: string, projectID: string) {
  const url = new URL(`/api/boc/environment/${projectID}`, "http://opencode.local")
  url.searchParams.set("directory", directory)
  return url
}

const backend = Effect.fnUntraced(function* (directory: string, channel?: string) {
  const context = yield* Layer.build(
    createRoutes(
      {
        password: "secret",
        app: { channel, version: "test-version" },
        database: { path: ":memory:" },
        config: { directory, project: false },
        fs: { filewatcher: false },
        models: { fetch: false },
      },
      () => [],
      [
        BocEnvironments.node.replace(
          BocEnvironments.configured({
            installation: async () => ({
              executable: path.join(directory, "devenv"),
              root: directory,
              setup: path.join(directory, "scripts", "worktree-setup.sh"),
              environment: {},
            }),
          }),
        ),
      ],
    ).pipe(Layer.provide(HttpServer.layerServices)),
  )
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  expect(
    Context.get(context, SdkPlugins.Service)
      .all()
      .some((plugin) => plugin.id === "boc.worktrees"),
  ).toBe(channel === "boc")
  const request = Effect.fnUntraced(function* (target: string | URL, method = "GET", body?: unknown) {
    const response = yield* Effect.promise((signal) =>
      handler(
        new Request(new URL(target, "http://opencode.local"), {
          method,
          headers: { authorization: `Basic ${btoa("opencode:secret")}`, "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        }),
      ),
    )
    expect(response.status).toBe(200)
    return yield* Effect.promise(() => response.json())
  })
  return { request, projects: Context.get(context, Project.Service) }
})
