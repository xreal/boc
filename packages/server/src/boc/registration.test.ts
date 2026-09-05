import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { Bus } from "@opencode-ai/core/bus"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Project } from "@opencode-ai/core/project"
import { Config } from "@opencode-ai/core/config"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { LocationServiceMap } from "@opencode-ai/core/location-service-map"
import { Plugin } from "@opencode-ai/core/plugin"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Worktree } from "@opencode-ai/core/worktree"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Global } from "@opencode-ai/util/global"
import { Effect } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { RIFT_STRATEGY, riftPlugin } from "@boc/extensions/worktrees/server"

describe("Rift worktree registration", () => {
  test.each([false, true])(
    "preserves Rift identity, directory configuration and plugin priority (project plugin: %s)",
    async (projectPlugin) => {
      const createdBySource = new Map<AbsolutePath, AbsolutePath[]>()
      const strategy = cloneStrategy(createdBySource)
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const fixture = yield* fixtureDirectory()
            const services = AppNodeBuilder.build(
              LayerNode.group([Project.node, SdkPlugins.node, LocationServiceMap.node, Database.node, Bus.node]),
              [
                Config.node.replace(
                  Config.configured({
                    project: false,
                    global: false,
                    content: JSON.stringify({
                      worktree: { directory: fixture.checkouts },
                      plugins: projectPlugin
                        ? [{ package: path.join(import.meta.dir, "../../test/fixture/worktree-plugin") }]
                        : [],
                    }),
                  }),
                ),
                ModelsDev.node.replace(ModelsDev.configured({ fetch: false })),
                Watcher.node.replace(Watcher.configured({ enabled: false })),
                Global.node.replace(
                  Global.layerWith({ data: fixture.root, config: path.join(fixture.root, "config") }),
                ),
              ],
            )
            yield* Effect.gen(function* () {
              const projects = yield* Project.Service
              const source = yield* projects.resolve(fixture.source)
              const plugins = yield* SdkPlugins.Service
              const locations = yield* LocationServiceMap.Service
              yield* plugins.register(riftPlugin(strategy))

              yield* Effect.gen(function* () {
                const activePlugins = yield* Plugin.Service
                const worktrees = yield* Worktree.Service
                yield* activePlugins.awaitActivation

                const ordinary = yield* worktrees.create({ name: "ordinary" })
                expect(ordinary.directory).toBe(AbsolutePath.make(path.join(fixture.checkouts, "ordinary")))
                expect(yield* worktrees.list()).toContainEqual({
                  directory: ordinary.directory,
                  strategy: projectPlugin ? "test-copy" : RIFT_STRATEGY,
                })
                const explicitGit = yield* worktrees.create({
                  strategy: Worktree.StrategyID.make("git"),
                  name: "explicit-git",
                })
                expect(yield* worktrees.list()).toContainEqual({ directory: explicitGit.directory, strategy: "git" })

                const created = yield* worktrees.create({
                  strategy: RIFT_STRATEGY,
                  from: source.canonical,
                  branch: fixture.commit,
                  directory: fixture.checkouts,
                  name: "rift-checkout",
                })

                const resolved = yield* projects.resolve(created.directory)
                const head = yield* Effect.promise(() => $`git rev-parse HEAD`.cwd(created.directory).quiet().text())
                const symbolicHead = yield* Effect.promise(() =>
                  $`git symbolic-ref -q HEAD`.cwd(created.directory).quiet().nothrow(),
                )
                const dotGit = yield* Effect.promise(() => fs.stat(path.join(created.directory, ".git")))
                expect(resolved.id).toBe(source.id)
                expect(head).toBe(`${fixture.commit}\n`)
                expect(symbolicHead.exitCode).not.toBe(0)
                expect(dotGit.isDirectory()).toBe(true)

                yield* worktrees.reload()
                yield* worktrees.refresh()
                expect(yield* worktrees.list()).toContainEqual({
                  directory: created.directory,
                  strategy: RIFT_STRATEGY,
                })

                yield* worktrees.remove({ directory: created.directory, force: false })
                yield* worktrees.remove({ directory: ordinary.directory, force: false })
                yield* worktrees.remove({ directory: explicitGit.directory, force: false })
                expect(yield* Effect.promise(() => directoryExists(created.directory))).toBe(false)
              }).pipe(Effect.provide(locations.get({ directory: fixture.source })))
            }).pipe(Effect.provide(services))
          }),
        ),
      )
    },
    15_000,
  )
})

function cloneStrategy(createdBySource: Map<AbsolutePath, AbsolutePath[]>): Worktree.Strategy {
  return {
    id: RIFT_STRATEGY,
    create: (input) =>
      Effect.promise(async () => {
        const commit = (
          await $`git rev-parse ${`${input.branch ?? "HEAD"}^{commit}`}`.cwd(input.sourceDirectory).quiet().text()
        ).trim()
        await $`git clone --no-hardlinks --no-checkout ${input.sourceDirectory} ${input.directory}`.quiet()
        await $`git checkout --detach ${commit}`.cwd(input.directory).quiet()
        const directory = AbsolutePath.make(await fs.realpath(input.directory))
        createdBySource.set(input.sourceDirectory, [...(createdBySource.get(input.sourceDirectory) ?? []), directory])
        return { directory }
      }),
    list: (sourceDirectory) =>
      Effect.promise(async () => [
        { directory: sourceDirectory, type: "root" as const },
        ...(await Promise.all(
          (createdBySource.get(sourceDirectory) ?? []).map(async (directory) => ({
            directory: AbsolutePath.make(await fs.realpath(directory)),
            type: "worktree" as const,
          })),
        )),
      ]),
    remove: (input) =>
      Effect.promise(async () => {
        await fs.rm(input.directory, { recursive: true })
        for (const [source, directories] of createdBySource) {
          createdBySource.set(
            source,
            directories.filter((directory) => directory !== input.directory),
          )
        }
      }),
  }
}

function fixtureDirectory() {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-registration-")))
      const source = AbsolutePath.make(path.join(root, "source"))
      await fs.mkdir(source)
      await $`git init`.cwd(source).quiet()
      await $`git config user.email test@boc.invalid`.cwd(source).quiet()
      await $`git config user.name Test`.cwd(source).quiet()
      await Bun.write(path.join(source, "README.md"), "Rift fixture\n")
      await $`git add README.md`.cwd(source).quiet()
      await $`git -c commit.gpgsign=false commit -m initial`.cwd(source).quiet()
      const commit = (await $`git rev-parse HEAD`.cwd(source).quiet().text()).trim()
      return { root, source, commit, checkouts: AbsolutePath.make(path.join(root, "checkouts")) }
    }),
    (fixture) => Effect.promise(() => fs.rm(fixture.root, { recursive: true, force: true })),
  )
}

function directoryExists(directory: string) {
  return fs.stat(directory).then(
    (stat) => stat.isDirectory(),
    () => false,
  )
}
