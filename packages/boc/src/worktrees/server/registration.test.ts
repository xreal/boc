import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { Bus } from "@opencode-ai/core/bus"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Project } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Worktree } from "@opencode-ai/core/worktree"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Effect } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { RIFT_STRATEGY, withRiftStrategy } from "./registration"

describe("Rift worktree registration", () => {
  test("composes with the real Worktree service and preserves project identity", async () => {
    const createdBySource = new Map<AbsolutePath, AbsolutePath[]>()
    const strategy = cloneStrategy(createdBySource)
    const riftWorktree = withRiftStrategy(strategy)
    const services = AppNodeBuilder.build(LayerNode.group([Project.node, riftWorktree, Database.node, Bus.node]))

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* fixtureDirectory()
          const projects = yield* Project.Service
          const worktrees = yield* Worktree.Service
          const source = yield* projects.resolve(fixture.source)

          const created = yield* worktrees.create({
            projectID: source.id,
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

          yield* worktrees.refresh({ projectID: source.id })
          expect(yield* worktrees.list(source.id)).toContainEqual({
            directory: created.directory,
            strategy: RIFT_STRATEGY,
          })

          yield* worktrees.remove({ projectID: source.id, directory: created.directory, force: false })
          expect(yield* Effect.promise(() => Bun.file(created.directory).exists())).toBe(false)
        }).pipe(Effect.provide(services)),
      ),
    )
  }, 15_000)
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
    remove: (input) => Effect.promise(() => fs.rm(input.directory, { recursive: true })),
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
