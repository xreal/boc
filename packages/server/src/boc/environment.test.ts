import { expect } from "bun:test"
import { $ } from "bun"
import { OpenCode } from "@opencode/client/promise"
import { Database } from "@opencode/core/database/database"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { WorktreeTable } from "@opencode/core/worktree/sql"
import { PersistentPty } from "@opencode/core/persistent-pty"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"
import { AbsolutePath } from "@opencode/schema/schema"
import { Project } from "@opencode/schema/project"
import { Session } from "@opencode/schema/session"
import { BocEnvironments } from "@boc/extensions/environments/server"
import { Global } from "@opencode/util/global"
import path from "node:path"
import fs from "node:fs/promises"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer, Schedule } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"
import { tmpdirScoped } from "../../../core/test/fixture/tmpdir"
import { initRepo } from "../../../core/test/fixture/git"
import { it } from "../../../core/test/lib/effect"
import { createRoutes } from "../routes"

it.live("serves environment RPC and accepts registered Lane linked worktrees", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-rpc-")
    yield* Effect.promise(() => initRepo(tmp.path))
    const upstream = yield* backend(tmp.path)
    const options = { location: { directory: tmp.path } }
    const missing = yield* Effect.promise(() => upstream.api.rpc(BocEnvironmentRpc.Rpc).info({}, options)).pipe(
      Effect.exit,
    )
    expect(missing._tag).toBe("Failure")

    const boc = yield* backend(tmp.path, "boc")
    const environments = boc.api.rpc(BocEnvironmentRpc.Rpc)
    expect(yield* Effect.promise(() => environments.info({}, options))).toEqual({ protocol: 2 })
    const unauthenticated = yield* Effect.promise(() =>
      boc.handler(
        new Request(
          `http://opencode.local/api/rpc/${BocEnvironmentRpc.Rpc.id}/info?location[directory]=${encodeURIComponent(tmp.path)}`,
          { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ input: {} }) },
        ),
      ),
    )
    expect(unauthenticated.status).toBe(401)
    const project = (yield* Effect.promise(() => boc.api.location.get(options))).project
    const projectID = Project.ID.make(project.id)
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
    const database = Context.get(boc.context, Database.Service)
    yield* database.db
      .update(WorktreeTable)
      .set({ strategy: "lane" })
      .where(and(eq(WorktreeTable.project_id, projectID), eq(WorktreeTable.directory, AbsolutePath.make(linked))))
    expect(
      yield* Effect.promise(() => environments.inspect({ ...checkout, directory: linked }, options)),
    ).toMatchObject({
      directory: linked,
      availability: { available: true },
      stack: { status: "unconfigured" },
    })

    const standalone = path.join(path.dirname(tmp.path), `${path.basename(tmp.path)}-standalone`)
    yield* Effect.promise(() => fs.mkdir(standalone))
    yield* Effect.promise(() => initRepo(standalone))
    yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(standalone, { recursive: true, force: true })))
    yield* database.db.insert(WorktreeTable).values({
      project_id: projectID,
      directory: AbsolutePath.make(standalone),
      strategy: "lane",
    })
    expect(
      yield* Effect.promise(() => environments.inspect({ ...checkout, directory: standalone }, options)),
    ).toMatchObject({ availability: { reason: "checkout-ownership-mismatch" } })
  }),
)

it.live("retains environment PTY output and mutation locks after Location disposal, then cancels through RPC", () =>
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped("boc-environment-rpc-")
    const source = path.join(tmp.path, "src")
    yield* Effect.promise(async () => {
      await fs.mkdir(source)
      await initRepo(source)
      await Promise.all([
        fs.mkdir(path.join(source, "shop", "source"), { recursive: true }),
        fs.mkdir(path.join(source, "common", "config"), { recursive: true }),
      ])
      await fs.writeFile(path.join(source, "shop", "source", ".env"), "fixture")
      await fs.writeFile(path.join(source, "shop", "fixture"), "fixture")
      await $`git add shop/fixture`.cwd(source).quiet()
      await $`git commit -m fixture`.cwd(source).quiet()
      await fs.mkdir(path.join(source, ".lane", "trees"), { recursive: true })
      await fs.appendFile(path.join(source, ".git", "info", "exclude"), ".lane/\n")
    })
    const linked = path.join(source, ".lane", "trees", "rpc-test")
    yield* Effect.promise(async () => {
      await $`git worktree add --detach ${linked}`.cwd(source).quiet()
      await Promise.all(
        ["scripts", "secrets", "bin"].map((name) => fs.mkdir(path.join(tmp.path, name), { recursive: true })),
      )
      await fs.writeFile(path.join(tmp.path, "bin/docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
      await fs.writeFile(
        path.join(tmp.path, "scripts/worktree-up.sh"),
        "#!/bin/sh\necho fixture-operation-started\nexec sleep 60\n",
        { mode: 0o755 },
      )
      await fs.writeFile(path.join(tmp.path, "scripts/worktree-down.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })
    })
    const boc = yield* backend(source, "boc", tmp.path)
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

const backend = Effect.fnUntraced(function* (directory: string, channel?: string, installationRoot = directory) {
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
              executable: path.join(installationRoot, "devenv"),
              root: installationRoot,
              up: path.join(installationRoot, "scripts", "worktree-up.sh"),
              down: path.join(installationRoot, "scripts", "worktree-down.sh"),
              environment: { PATH: `${path.join(installationRoot, "bin")}${path.delimiter}${process.env.PATH ?? ""}` },
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
