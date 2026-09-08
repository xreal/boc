import { expect } from "bun:test"
import { $ } from "bun"
import { OpenCode } from "@opencode/client/promise"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Worktree } from "@opencode/core/worktree"
import { PersistentPty } from "@opencode/core/persistent-pty"
import { BocWorktreeRpc } from "@opencode/schema/boc/worktree-rpc"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { BocEnvironments } from "@boc/extensions/environments/server"
import { riftPlugin } from "@boc/extensions/worktrees/server"
import { Global } from "@opencode/util/global"
import path from "node:path"
import fs from "node:fs/promises"
import { Context, Deferred, Effect, Layer, Schedule } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"
import { tmpdirScoped } from "../../../core/test/fixture/tmpdir"
import { initRepo } from "../../../core/test/fixture/git"
import { it } from "../../../core/test/lib/effect"
import { createRoutes } from "../routes"

it.live("serves typed Boc RPC through authenticated clients and preserves checkout ownership", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-rpc-")
    yield* Effect.promise(() => initRepo(tmp.path))
    const upstream = yield* backend(tmp.path)
    const options = { location: { directory: tmp.path } }
    const missing = yield* Effect.promise(() => upstream.api.rpc(BocWorktreeRpc.Rpc).info({}, options)).pipe(
      Effect.exit,
    )
    expect(missing._tag).toBe("Failure")

    const boc = yield* backend(tmp.path, "boc")
    const worktrees = boc.api.rpc(BocWorktreeRpc.Rpc)
    const environments = boc.api.rpc(BocEnvironmentRpc.Rpc)
    expect(yield* Effect.promise(() => worktrees.info({}, options))).toEqual({ protocol: 1 })
    expect(yield* Effect.promise(() => environments.info({}, options))).toEqual({ protocol: 1 })
    const unauthenticated = yield* Effect.promise(() =>
      boc.handler(
        new Request(
          `http://opencode.local/api/rpc/${BocWorktreeRpc.Rpc.id}/info?location[directory]=${encodeURIComponent(tmp.path)}`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: {} }) },
        ),
      ),
    )
    expect(unauthenticated.status).toBe(401)
    const retired = yield* Effect.promise(() =>
      boc.handler(
        new Request("http://opencode.local/api/boc/worktree/rift-trash", {
          headers: { authorization: `Basic ${btoa("opencode:secret")}` },
        }),
      ),
    )
    expect(retired.status).toBe(404)

    const project = (yield* Effect.promise(() => boc.api.location.get(options))).project
    const capability = { projectID: project.id, source: tmp.path, directory: tmp.path }
    expect(
      yield* Effect.promise(() => worktrees.riftCapability({ ...capability, projectID: "missing" }, options)),
    ).toMatchObject({ reason: "project-mismatch" })
    expect(yield* Effect.promise(() => worktrees.riftCapability(capability, options))).toMatchObject({
      reason: "project-mismatch",
    })
    expect(
      yield* Effect.promise(() =>
        worktrees.riftCapability({ ...capability, directory: path.dirname(tmp.path) }, options),
      ),
    ).not.toMatchObject({ reason: "project-mismatch" })
    expect(yield* Effect.promise(() => worktrees.riftTrash({}, options))).toEqual({ checkouts: 0 })
    expect(yield* Effect.promise(() => worktrees.cleanupRiftTrash({}, options))).toMatchObject({ checkouts: 0 })

    const checkout = { projectID: project.id, directory: tmp.path }
    expect(yield* Effect.promise(() => environments.inspect(checkout, options))).toMatchObject({
      availability: { reason: "checkout-not-isolated" },
    })
    expect(
      yield* Effect.promise(() => environments.inspect({ ...checkout, projectID: "missing" }, options)),
    ).toMatchObject({ availability: { reason: "checkout-not-registered" } })
    expect(
      yield* Effect.promise(() =>
        environments.run({ ...checkout, sessionID: Session.ID.create(), action: "setup" }, options),
      ),
    ).toMatchObject({ accepted: false, reason: "not-available" })
    expect(yield* Effect.promise(() => environments.cancel(checkout, options))).toMatchObject({ cancelled: false })

    const linked = path.join(path.dirname(tmp.path), `${path.basename(tmp.path)}-linked`)
    yield* Effect.promise(() => $`git worktree add --detach ${linked}`.cwd(tmp.path).quiet())
    yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(linked, { recursive: true, force: true })))
    yield* Effect.promise(() => boc.api.location.get({ location: { directory: linked } }))
    expect(
      yield* Effect.promise(() => environments.inspect({ ...checkout, directory: linked }, options)),
    ).toMatchObject({
      directory: linked,
      availability: { available: true, strategy: "git" },
      stack: { status: "unconfigured" },
    })
  }),
)

it.live(
  "keeps preparation and its source Location lease alive across disposal, navigation and duplicate requests",
  () =>
    Effect.gen(function* () {
      const tmp = yield* tmpdirScoped("boc-preparation-rpc-")
      yield* Effect.promise(() => initRepo(tmp.path))
      const boc = yield* backend(tmp.path, "boc")
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const calls: string[] = []
      yield* Context.get(boc.context, SdkPlugins.Service).register(
        riftPlugin({
          id: Worktree.StrategyID.make("test-delayed"),
          create: (input) =>
            Effect.gen(function* () {
              calls.push(input.sourceDirectory)
              yield* Deferred.succeed(started, undefined)
              yield* Deferred.await(release)
              yield* Effect.promise(() =>
                $`git worktree add --detach ${input.directory}`.cwd(input.sourceDirectory).quiet(),
              )
              return { directory: input.directory }
            }),
          list: () => Effect.succeed([]),
          remove: () => Effect.void,
        }),
      )
      const rpc = boc.api.rpc(BocWorktreeRpc.Rpc)
      const operationID = Session.ID.create()
      const destination = path.join(tmp.path, "checkouts")
      const options = { location: { directory: tmp.path } }
      const input = {
        operationID,
        worktree: { strategy: "test-delayed", from: tmp.path, directory: destination, name: "tracked" },
      }
      expect(yield* Effect.promise(() => rpc.prepare(input, options))).toMatchObject({ operationID, status: "running" })
      yield* Deferred.await(started)
      yield* Context.get(boc.context, LocationServiceMap.Service).invalidate({ directory: AbsolutePath.make(tmp.path) })
      const elsewhere = { location: { directory: path.dirname(tmp.path) } }
      expect(yield* Effect.promise(() => rpc.preparation({ operationID }, elsewhere))).toMatchObject({
        status: "running",
      })
      expect(
        yield* Effect.promise(() =>
          rpc.prepare({ ...input, worktree: { ...input.worktree, name: "duplicate" } }, elsewhere),
        ),
      ).toMatchObject({ operationID, status: "running" })
      yield* Deferred.succeed(release, undefined)
      const completed = yield* Effect.promise(() => rpc.preparation({ operationID }, elsewhere)).pipe(
        Effect.filterOrFail(
          (state) => state?.status !== "running",
          () => new Error("still running"),
        ),
        Effect.retry({ schedule: Schedule.spaced("10 millis"), times: 100 }),
      )
      if (!completed) throw new Error("Preparation snapshot is missing")
      expect(completed).toMatchObject({
        status: "succeeded",
        directory: path.join(destination, "tracked"),
        origin: { directory: tmp.path },
      })
      expect(calls).toEqual([tmp.path])
      const destinationOptions = { location: { directory: path.join(destination, "tracked") } }
      expect(yield* Effect.promise(() => rpc.preparation({ operationID }, destinationOptions))).toEqual(completed)
      expect(yield* Effect.promise(() => rpc.prepare(input, destinationOptions))).toEqual(completed)
      expect(calls).toHaveLength(1)
    }),
)

it.live("retains environment PTY output and mutation locks after Location disposal, then cancels through RPC", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-environment-rpc-")
    yield* Effect.promise(() => initRepo(tmp.path))
    const linked = path.join(tmp.path, "linked")
    yield* Effect.promise(async () => {
      await $`git worktree add --detach ${linked}`.cwd(tmp.path).quiet()
      await Promise.all(
        ["shop", "scripts", "src/common/config", "src/shop/source", "secrets", "bin"].map((name) =>
          fs.mkdir(path.join(tmp.path, name), { recursive: true }),
        ),
      )
      await fs.mkdir(path.join(linked, "shop"))
      await fs.writeFile(path.join(tmp.path, "src/shop/source/.env"), "fixture")
      await fs.writeFile(path.join(tmp.path, "bin/docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
      await fs.writeFile(
        path.join(tmp.path, "scripts/worktree-setup.sh"),
        "#!/bin/sh\necho fixture-operation-started\nexec sleep 60\n",
        { mode: 0o755 },
      )
    })
    const boc = yield* backend(tmp.path, "boc")
    const options = { location: { directory: linked } }
    const project = (yield* Effect.promise(() => boc.api.location.get(options))).project
    const rpc = boc.api.rpc(BocEnvironmentRpc.Rpc)
    const input = { projectID: project.id, directory: linked, sessionID: Session.ID.create(), action: "setup" as const }
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => rpc.cancel(input, { location: { directory: tmp.path } })).pipe(Effect.ignore),
    )
    expect(yield* Effect.promise(() => rpc.run(input, options))).toMatchObject({ accepted: true })
    yield* Context.get(boc.context, PersistentPty.Service)
      .list()
      .pipe(
        Effect.filterOrFail(
          (terminals) => terminals.some((terminal) => terminal.output.tail > 0),
          () => new Error("waiting for PTY output"),
        ),
        Effect.retry({ schedule: Schedule.spaced("20 millis"), times: 100 }),
      )
    yield* Context.get(boc.context, LocationServiceMap.Service).invalidate({ directory: AbsolutePath.make(linked) })
    const elsewhere = { location: { directory: tmp.path } }
    expect(yield* Effect.promise(() => rpc.inspect(input, elsewhere))).toMatchObject({
      latestRun: { status: "running" },
    })
    expect(yield* Effect.promise(() => rpc.run(input, elsewhere))).toMatchObject({
      accepted: false,
      reason: "operation-running",
    })
    expect(yield* Effect.promise(() => rpc.cancel(input, elsewhere))).toMatchObject({
      cancelled: true,
      environment: { latestRun: { status: "cancelled" } },
    })
    expect((yield* Effect.promise(() => rpc.inspect(input, options))).latestRun?.log).toContain(
      "fixture-operation-started",
    )
  }),
)

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
        Global.node.replace(
          Global.layerWith({
            state: path.join(directory, "state"),
            data: path.join(directory, "data"),
            cache: path.join(directory, "cache"),
          }),
        ),
        BocEnvironments.node.replace(
          BocEnvironments.configured({
            installation: async () => ({
              executable: path.join(directory, "devenv"),
              root: directory,
              setup: path.join(directory, "scripts", "worktree-setup.sh"),
              environment: { PATH: `${path.join(directory, "bin")}${path.delimiter}${process.env.PATH ?? ""}` },
            }),
          }),
        ),
      ],
    ).pipe(Layer.provide(HttpServer.layerServices)),
  )
  const handler = Context.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  const api = OpenCode.make({
    baseUrl: "http://opencode.local",
    headers: { authorization: `Basic ${btoa("opencode:secret")}` },
    fetch: Object.assign((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)), {
      preconnect() {},
    }),
  })
  return { api, handler, context }
})
