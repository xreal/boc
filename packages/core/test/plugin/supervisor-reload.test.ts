import { describe, expect, setDefaultTimeout } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Deferred, Duration, Effect, Fiber, Layer, LayerMap, Schedule } from "effect"
import { TestClock } from "effect/testing"
import { define } from "@opencode-ai/plugin/effect/plugin"
import { Event } from "@opencode-ai/schema/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Global } from "@opencode-ai/util/global"
import { Npm } from "@opencode-ai/util/npm"
import { Bus } from "@opencode-ai/core/bus"
import { Command } from "@opencode-ai/core/command"
import { Database } from "@opencode-ai/core/database/database"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { Instance } from "@opencode-ai/core/instance"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { Location } from "@opencode-ai/core/location"
import { Plugin } from "@opencode-ai/core/plugin"
import { Rpc } from "@opencode-ai/core/rpc"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { tempGlobalLayer } from "../fixture/global"
import { offlineModels } from "../fixture/models"
import { tmpdirScoped } from "../fixture/tmpdir"
import { advance } from "../lib/clock"
import { testEffect } from "../lib/effect"

// Real Location boot with plugin-directory discovery, so local plugin files are loaded and reloaded.
setDefaultTimeout(15_000)

// Package resolution can be held open so overlapping activations become observable.
const npm = {
  directory: "",
  cached: true,
  installs: 0,
  gate: undefined as Deferred.Deferred<void> | undefined,
  inflight: 0,
  peak: 0,
}

const npmLayer = Layer.succeed(
  Npm.Service,
  Npm.Service.of({
    add: (name) =>
      Effect.sync(() => {
        npm.installs++
        return { directory: npm.directory, name }
      }),
    resolve: (name) =>
      Effect.gen(function* () {
        npm.inflight++
        npm.peak = Math.max(npm.peak, npm.inflight)
        if (npm.gate) yield* Deferred.await(npm.gate)
        npm.inflight--
        return { directory: npm.cached ? npm.directory : path.join(npm.directory, "..", "missing"), name }
      }),
    check: () => Effect.succeed(false),
    update: (name) => Effect.succeed({ directory: npm.directory, name }),
    which: () => Effect.undefined,
  }),
)

const instances = Layer.effect(
  LocationServiceMap.Service,
  Effect.gen(function* () {
    const watcher = yield* Watcher.Test
    const map = yield* LayerMap.make((ref: Location.Ref) => Instance.layer(ref, { replacements: bindings }), {
      idleTimeToLive: Duration.infinity,
    })
    const bindings: LayerNode.Replacements = [
      Global.node.replace(tempGlobalLayer),
      offlineModels,
      Npm.node.replace(npmLayer),
      Watcher.node.replace(Layer.succeed(Watcher.Service, watcher)),
      LocationServiceMap.node.replace(Layer.succeed(LocationServiceMap.Service, map)),
      Instance.node.replace(
        Layer.succeed(Instance.Service, {
          provide: (session) => Effect.provide(map.get(session.location)),
        }),
      ),
    ]
    return map
  }),
).pipe(Layer.provide(Watcher.testLayer))

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Bus.node, SdkPlugins.node, LocationServiceMap.node]), [
    Global.node.replace(tempGlobalLayer),
    offlineModels,
    LocationServiceMap.node.replace(instances),
  ]).pipe(Layer.provideMerge(Watcher.testLayer)),
)

const greeter = (command: string) => `export default {
  id: "greeter",
  async setup(ctx) {
    await ctx.command.transform((editor) => editor.add({ name: "${command}", execute: async () => {} }))
  },
}`

// Real-time polling: reloads do filesystem work that the TestClock cannot advance.
const settle = (predicate: () => boolean, attempts = 200): Effect.Effect<void, string> =>
  Effect.suspend(() => {
    if (predicate()) return Effect.void
    if (attempts === 0) return Effect.fail("not settled")
    return Effect.promise(() => Bun.sleep(10)).pipe(Effect.andThen(settle(predicate, attempts - 1)))
  })

const failed = (plugins: Plugin.Interface) =>
  plugins.list().pipe(
    Effect.flatMap((inventory) => {
      const failure = inventory.find((plugin) => plugin.state.status === "failed" && plugin.source.type === "local")
      return failure ? Effect.succeed(failure) : Effect.fail("activation pending")
    }),
    Effect.retry({ times: 200, schedule: Schedule.spaced("25 millis") }),
  )

describe("PluginSupervisor reload", () => {
  ;(
    [
      "bundle",
      "external",
      "import-failure",
      "setup-failure",
      "file-path",
      "missing-entrypoint",
      "disabled",
      "bundle-disabled",
      "options",
      "reenabled",
    ] as const
  ).forEach((scenario) => {
    it.live(`selects host fallbacks before activation: ${scenario}`, () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const external = path.join(directory.path, "external/bergflow")
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(external, "index.ts"),
            scenario === "import-failure"
              ? 'throw new Error("broken external import"); export default {}'
              : `export default { id: "bergflow", async setup(ctx) {
                  ${scenario === "setup-failure" ? 'throw new Error("broken external setup");' : ""}
                  await ctx.command.transform(editor => editor.add({ name: ctx.options.command, execute: async () => {} }))
                } }`,
          )
          if (scenario === "missing-entrypoint") await fs.rm(path.join(external, "index.ts"))
          await Bun.write(
            path.join(directory.path, ".opencode/opencode.json"),
            JSON.stringify({
              plugins:
                scenario === "bundle"
                  ? []
                  : scenario === "bundle-disabled"
                    ? ["-bergflow"]
                    : scenario === "reenabled"
                      ? ["-*", "bergflow"]
                      : scenario === "options"
                        ? [{ package: "bergflow", options: { command: "configured-bundle" } }]
                        : [
                            {
                              package: scenario === "file-path" ? path.join(external, "index.ts") : external,
                              options: { command: "external-choice" },
                            },
                            ...(scenario === "disabled" ? ["-bergflow"] : []),
                          ],
            }),
          )
        })
        const sdk = yield* SdkPlugins.Service
        let activations = 0
        yield* sdk.register(
          define({
            id: "bergflow",
            effect: (ctx) =>
              Effect.gen(function* () {
                activations++
                yield* ctx.command.transform((editor) =>
                  editor.add({
                    name: typeof ctx.options.command === "string" ? ctx.options.command : "bundle-choice",
                    execute: () => Effect.void,
                  }),
                )
              }),
          }),
          { fallback: true },
        )
        const locations = yield* LocationServiceMap.Service
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const commands = yield* Command.Service
          yield* plugins.awaitActivation
          const inventory = yield* plugins.list()
          const active = inventory.filter((plugin) => plugin.id === "bergflow" && plugin.state.status === "active")
          const bundled = ["bundle", "options", "reenabled"].includes(scenario)
          expect(activations).toBe(bundled ? 1 : 0)
          expect(active).toHaveLength(bundled || scenario === "external" ? 1 : 0)
          expect(Boolean(yield* commands.get("external-choice"))).toBe(scenario === "external")
          expect(Boolean(yield* commands.get(scenario === "options" ? "configured-bundle" : "bundle-choice"))).toBe(
            bundled,
          )
          expect(
            inventory.some(
              (plugin) => plugin.state.status === "failed" && plugin.state.error.startsWith("Duplicate plugin ID"),
            ),
          ).toBe(false)
          if (scenario === "external") expect(active[0].source).toMatchObject({ type: "local" })
          if (bundled) expect(active[0].source).toEqual({ type: "sdk" })
          if (["import-failure", "file-path", "missing-entrypoint"].includes(scenario))
            expect(inventory).toContainEqual(
              expect.objectContaining({
                id: "bergflow",
                source: { type: "sdk" },
                state: expect.objectContaining({
                  status: "failed",
                  error: expect.stringContaining("could not be identified"),
                }),
              }),
            )
          if (scenario === "setup-failure")
            expect(inventory).toContainEqual(
              expect.objectContaining({
                id: "bergflow",
                source: expect.objectContaining({ type: "local" }),
                state: expect.objectContaining({ status: "failed" }),
              }),
            )
        }).pipe(
          Effect.scoped,
          Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
        )
      }),
    )
  })

  it.live("preserves plugin storage when switching between external and host fallback", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const external = path.join(directory.path, "external/bergflow")
      const config = path.join(directory.path, ".opencode/opencode.json")
      yield* Effect.promise(async () => {
        await Bun.write(
          path.join(external, "index.ts"),
          `export default { id: "bergflow", async setup(ctx) {
          await ctx.storage.set("policy", "external-policy")
          await ctx.command.transform(editor => editor.add({ name: "external-choice", execute: async () => {} }))
        } }`,
        )
        await Bun.write(config, JSON.stringify({ plugins: [external] }))
      })
      const sdk = yield* SdkPlugins.Service
      yield* sdk.register(
        define({
          id: "bergflow",
          effect: (ctx) =>
            Effect.gen(function* () {
              const policy = yield* ctx.storage.get("policy")
              yield* ctx.command.transform((editor) =>
                editor.add({ name: "bundle-choice", description: String(policy), execute: () => Effect.void }),
              )
            }),
        }),
        { fallback: true },
      )
      const bus = yield* Bus.Service
      const locations = yield* LocationServiceMap.Service
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const commands = yield* Command.Service
        yield* plugins.awaitActivation
        expect(yield* commands.get("external-choice")).toBeDefined()
        yield* Effect.promise(() => Bun.write(config, JSON.stringify({ plugins: [] })))
        yield* bus.publish(Event.Updated, {})
        yield* commands.get("bundle-choice").pipe(
          Effect.flatMap((command) => (command ? Effect.succeed(command) : Effect.fail("activation pending"))),
          Effect.retry({ times: 80, schedule: Schedule.spaced("25 millis") }),
        )
        expect(yield* commands.get("external-choice")).toBeUndefined()
        expect(yield* commands.get("bundle-choice")).toMatchObject({ description: "external-policy" })
      }).pipe(
        Effect.scoped,
        Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
      )
    }),
  )

  it.live("does not activate a fallback while its external package is being installed", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      npm.directory = path.join(directory.path, "cache")
      npm.cached = false
      npm.installs = 0
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          npm.cached = true
        }),
      )
      const external = path.join(npm.directory, "node_modules/fallback-fixture")
      yield* Effect.promise(async () => {
        await Bun.write(
          path.join(external, "package.json"),
          JSON.stringify({ name: "fallback-fixture", exports: { "./server": "./server.ts" } }),
        )
        await Bun.write(path.join(external, "server.ts"), greeter("external-choice"))
        await Bun.write(
          path.join(directory.path, ".opencode/opencode.json"),
          JSON.stringify({ plugins: ["fallback-fixture"] }),
        )
      })
      const sdk = yield* SdkPlugins.Service
      let activations = 0
      yield* sdk.register(
        define({
          id: "greeter",
          effect: () =>
            Effect.sync(() => {
              activations++
            }),
        }),
        { fallback: true },
      )
      const locations = yield* LocationServiceMap.Service
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const commands = yield* Command.Service
        yield* plugins.awaitActivation
        expect(npm.installs).toBe(1)
        expect(activations).toBe(0)
        expect(yield* commands.get("external-choice")).toBeDefined()
        expect((yield* plugins.list()).filter((plugin) => plugin.id === "greeter")).toEqual([
          expect.objectContaining({
            source: { type: "package", target: "fallback-fixture" },
            state: { status: "active" },
          }),
        ])
      }).pipe(
        Effect.scoped,
        Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
      )
    }),
  )
  ;(
    [
      { name: "on a helper-only save", helper: "nested/helper.ts", touchEntry: false },
      { name: "when the entrypoint also changes", helper: "nested/helper.ts", touchEntry: true },
      { name: "outside the configured plugin directory", helper: "../shared/helper.ts", touchEntry: false },
    ] as const
  ).forEach((scenario) => {
    it.live(`reloads helper-defined RPC methods ${scenario.name}`, () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const root = path.join(directory.path, "external/greeter")
        const file = path.join(root, "index.ts")
        const helper = path.join(root, scenario.helper)
        const entry = `export { default } from ${JSON.stringify("./" + scenario.helper)}`
        const source = (version: number) => `import { Schema } from ${JSON.stringify(import.meta.resolve("effect"))}
          export default {
            id: "greeter",
            async setup(ctx) {
              await ctx.rpc.register({ id: "greeter", methods: {
                status: { input: Schema.Unknown, output: Schema.Number },
                ${version > 1 ? "info: { input: Schema.Unknown, output: Schema.Number }," : ""}
              }, events: {} }, {
                status: async () => ${version},
                ${version > 1 ? `info: async () => ${version},` : ""}
              })
              await ctx.command.transform(editor => editor.add({ name: "greet-v${version}", execute: async () => {} }))
            }
          }`
        yield* Effect.promise(async () => {
          await Bun.write(file, entry)
          await Bun.write(helper, source(1))
          await Bun.write(path.join(directory.path, ".opencode/opencode.json"), JSON.stringify({ plugins: [root] }))
        })
        const watcher = yield* Watcher.Test
        const locations = yield* LocationServiceMap.Service
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const rpc = yield* Rpc.Service
          const commands = yield* Command.Service
          yield* plugins.awaitActivation
          expect(yield* rpc.call("greeter", "status", {})).toBe(1)
          expect(yield* rpc.call("greeter", "info", {}).pipe(Effect.flip)).toMatchObject({
            type: "rpc.method_not_found",
          })

          yield* Effect.promise(async () => {
            await Bun.write(helper, source(2))
            if (scenario.touchEntry) {
              await Bun.write(file, entry + "; // updated entry")
              await fs.utimes(file, new Date(), new Date(Date.now() + 1000))
            }
          })
          yield* watcher.emit({ path: scenario.touchEntry ? file : helper, type: "update" })
          yield* rpc
            .call("greeter", "info", {})
            .pipe(Effect.retry({ times: 80, schedule: Schedule.spaced("25 millis") }))
          expect(yield* rpc.call("greeter", "info", {})).toBe(2)
          expect(yield* commands.get("greet-v1")).toBeUndefined()
          expect(yield* commands.get("greet-v2")).toBeDefined()

          // Failed helper evaluations retain the active registration and recover on the next save.
          yield* Effect.promise(() => Bun.write(helper, 'throw new Error("broken helper"); export default {}'))
          yield* watcher.emit({ path: helper, type: "update" })
          yield* failed(plugins)
          expect(yield* rpc.call("greeter", "info", {})).toBe(2)
          yield* Effect.promise(() => Bun.write(helper, source(3)))
          yield* watcher.emit({ path: helper, type: "update" })
          yield* commands.get("greet-v3").pipe(
            Effect.flatMap((command) => (command ? Effect.void : Effect.fail("activation pending"))),
            Effect.retry({ times: 80, schedule: Schedule.spaced("25 millis") }),
          )
          expect(yield* rpc.call("greeter", "info", {})).toBe(3)
          expect(yield* commands.get("greet-v2")).toBeUndefined()
        }).pipe(
          Effect.scoped,
          Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
        )
      }),
    )
  })
  ;(["discovered", "configured"] as const).forEach((mode) => {
    it.effect(`retains a ${mode} plugin change during initial activation`, () =>
      Effect.gen(function* () {
        const directory = yield* tmpdirScoped()
        const file = path.join(
          directory.path,
          mode === "discovered" ? ".opencode/plugins/greeter.ts" : "external/greeter/index.ts",
        )
        yield* Effect.promise(async () => {
          await Bun.write(file, greeter("greet-v1"))
          await fs.utimes(file, new Date(0), new Date(0))
          if (mode === "configured") {
            await Bun.write(
              path.join(directory.path, ".opencode/opencode.json"),
              JSON.stringify({ plugins: [path.dirname(file)] }),
            )
          }
        })
        const entered = yield* Deferred.make<void>()
        const gate = yield* Deferred.make<void>()
        const sdk = yield* SdkPlugins.Service
        yield* sdk.register(
          define({
            id: "gated",
            effect: () => Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(gate))),
          }),
        )
        const watcher = yield* Watcher.Test
        const locations = yield* LocationServiceMap.Service
        yield* Effect.gen(function* () {
          const plugins = yield* Plugin.Service
          const commands = yield* Command.Service
          yield* Deferred.await(entered)
          // The real ConfigPluginSource merges config-root changes and configured-path watches.
          // Emit while setup is blocked, without a bus event that could mask a lost source trigger.
          yield* Effect.promise(async () => {
            await Bun.write(file, greeter("greet-v2"))
            await fs.utimes(file, new Date(), new Date())
          })
          yield* watcher.emit({ path: file, type: "update" })
          const ready = yield* plugins.awaitActivation.pipe(Effect.forkScoped({ startImmediately: true }))
          yield* Deferred.succeed(gate, undefined)
          yield* advance(() => ready.pollUnsafe() !== undefined)
          yield* Fiber.join(ready)

          expect(yield* commands.get("greet-v1")).toBeUndefined()
          expect(yield* commands.get("greet-v2")).toBeDefined()
        }).pipe(
          Effect.scoped,
          Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
        )
      }),
    )
  })

  it.live("keeps the running generation when an updated local plugin fails to import", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      const file = path.join(directory.path, ".opencode/plugins/greeter.ts")
      // Local plugin revisions key on mtime, so give each rewrite a distinct timestamp.
      const write = (content: string, mtime: Date) =>
        Effect.promise(async () => {
          await Bun.write(file, content)
          await fs.utimes(file, mtime, mtime)
        })
      yield* write(greeter("greet-v1"), new Date(Date.now() - 60_000))
      const bus = yield* Bus.Service
      const locations = yield* LocationServiceMap.Service
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const commands = yield* Command.Service
        yield* plugins.awaitActivation
        expect(yield* commands.get("greet-v1")).toBeDefined()

        yield* write("export default {", new Date())
        yield* bus.publish(Event.Updated, {})
        const failure = yield* failed(plugins)

        expect(failure).toMatchObject({ source: { type: "local", path: file }, state: { status: "failed" } })
        // The broken revision never produced a generation, so the previous one keeps running.
        expect(yield* commands.get("greet-v1")).toBeDefined()
        expect(yield* plugins.list()).toContainEqual(
          expect.objectContaining({
            id: "greeter",
            source: { type: "local", path: file },
            state: { status: "active" },
          }),
        )
      }).pipe(
        Effect.scoped,
        Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
      )
    }),
  )

  it.effect("serializes the periodic refresh behind an in-flight reload", () =>
    Effect.gen(function* () {
      const directory = yield* tmpdirScoped()
      npm.directory = path.join(directory.path, "fixture-pkg")
      npm.gate = undefined
      npm.peak = 0
      yield* Effect.promise(() =>
        Bun.write(
          path.join(npm.directory, "package.json"),
          JSON.stringify({ name: "fixture-pkg", exports: { "./server": "./server.ts" } }),
        ),
      )
      yield* Effect.promise(() => Bun.write(path.join(npm.directory, "server.ts"), greeter("greet-pkg")))
      yield* Effect.promise(() =>
        Bun.write(path.join(directory.path, ".opencode/opencode.json"), JSON.stringify({ plugins: ["fixture-pkg"] })),
      )
      const bus = yield* Bus.Service
      const locations = yield* LocationServiceMap.Service
      yield* Effect.gen(function* () {
        const plugins = yield* Plugin.Service
        const commands = yield* Command.Service
        yield* TestClock.adjust("100 millis")
        yield* plugins.awaitActivation
        expect(yield* commands.get("greet-pkg")).toBeDefined()
        expect(npm.peak).toBe(1)

        // Hold the next resolve open, then let the 24 hour refresh fire while it is blocked.
        const gate = yield* Deferred.make<void>()
        npm.gate = gate
        npm.inflight = 0
        npm.peak = 0
        yield* bus.publish(Event.Updated, {})
        yield* TestClock.adjust("100 millis")
        yield* settle(() => npm.inflight === 1)
        yield* TestClock.adjust("24 hours")
        // Without serialization the refresh resolves concurrently with the held reload and the peak reaches 2.
        yield* settle(() => npm.peak > 1, 50).pipe(Effect.ignore)
        const peak = npm.peak
        yield* Deferred.succeed(gate, undefined)
        npm.gate = undefined
        yield* TestClock.adjust("100 millis")
        yield* plugins.awaitActivation

        expect(peak).toBe(1)
      }).pipe(
        Effect.scoped,
        Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(directory.path) }))),
      )
    }),
  )
})
