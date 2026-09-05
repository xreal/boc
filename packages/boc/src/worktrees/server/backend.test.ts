import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { Git } from "@opencode-ai/core/git"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRiftBackend } from "./backend"

const binary = process.env.BOC_RIFT_TEST_BINARY

describe("Rift backend", () => {
  test.skipIf(!binary)(
    "creates and removes a real Rift checkout without source residue",
    async () => {
      const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-backend-")))

      try {
        const source = AbsolutePath.make(path.join(root, "source"))
        const checkouts = path.join(root, "checkouts")
        await fs.mkdir(source)
        await fs.mkdir(checkouts)
        await $`git init`.cwd(source).quiet()
        await $`git config user.email test@boc.invalid`.cwd(source).quiet()
        await $`git config user.name Test`.cwd(source).quiet()
        await Bun.write(path.join(source, "README.md"), "selected\n")
        await $`git add README.md`.cwd(source).quiet()
        await $`git -c commit.gpgsign=false commit -m selected`.cwd(source).quiet()
        const selected = (await $`git rev-parse HEAD`.cwd(source).quiet().text()).trim()
        await Bun.write(path.join(source, "README.md"), "later\n")
        await $`git add README.md`.cwd(source).quiet()
        await $`git -c commit.gpgsign=false commit -m later`.cwd(source).quiet()
        await $`git remote add origin https://github.com/example/project.git`.cwd(source).quiet()
        await $`git remote set-url --push origin ssh://git@github.com/example/project.git`.cwd(source).quiet()
        await Bun.write(path.join(source, "dirty.txt"), "source-only\n")

        const backend = createRiftBackend({ binary, stateDirectory: path.join(root, "state") })
        const destination = AbsolutePath.make(path.join(checkouts, "rift-checkout"))
        const created = await Effect.runPromise(
          backend.strategy.create({ sourceDirectory: source, directory: destination, branch: selected }),
        )

        expect(created.directory).toBe(destination)
        expect(await Bun.file(path.join(destination, "README.md")).text()).toBe("selected\n")
        expect(await Bun.file(path.join(destination, "dirty.txt")).exists()).toBe(false)
        expect((await fs.stat(path.join(destination, ".git"))).isDirectory()).toBe(true)
        expect((await $`git rev-parse HEAD`.cwd(destination).quiet().text()).trim()).toBe(selected)
        expect((await $`git remote get-url origin`.cwd(destination).quiet().text()).trim()).toBe(
          "https://github.com/example/project.git",
        )
        expect((await $`git remote get-url --push origin`.cwd(destination).quiet().text()).trim()).toBe(
          "ssh://git@github.com/example/project.git",
        )
        expect(await Effect.runPromise(backend.strategy.list(source))).toContainEqual({
          directory: destination,
          type: "worktree",
        })

        await Bun.write(path.join(destination, "untracked.txt"), "keep me\n")
        const protectedRemoval = await Effect.runPromise(
          backend.strategy.remove({ directory: destination, force: false }).pipe(Effect.flip),
        )
        expect(protectedRemoval).toBeInstanceOf(Git.WorktreeError)
        if (protectedRemoval instanceof Git.WorktreeError) expect(protectedRemoval.forceRequired).toBe(true)
        expect(await Bun.file(path.join(destination, "untracked.txt")).exists()).toBe(true)

        await fs.rm(path.join(destination, "untracked.txt"))
        await Bun.write(path.join(destination, "private.txt"), "private commit\n")
        await $`git add private.txt`.cwd(destination).quiet()
        await $`git -c user.name=Test -c user.email=test@boc.invalid -c commit.gpgsign=false commit -m private`
          .cwd(destination)
          .quiet()
        const privateHistory = await Effect.runPromise(
          backend.strategy.remove({ directory: destination, force: false }).pipe(Effect.flip),
        )
        expect(privateHistory).toBeInstanceOf(Git.WorktreeError)
        if (privateHistory instanceof Git.WorktreeError) {
          expect(privateHistory.message).toBe("Rift checkout contains changes or independent Git history.")
          expect(privateHistory.forceRequired).toBe(true)
        }
        expect(await directoryExists(destination)).toBe(true)

        await Effect.runPromise(backend.strategy.remove({ directory: destination, force: true }))
        expect(await directoryExists(destination)).toBe(false)
        expect(await backend.trash()).toEqual({ checkouts: 1 })
        expect(await backend.cleanup()).toEqual({ completed: true, checkouts: 1 })
        expect(await backend.trash()).toEqual({ checkouts: 0 })
        expect(await Effect.runPromise(backend.strategy.list(source))).not.toContainEqual({
          directory: destination,
          type: "worktree",
        })
      } finally {
        await fs.rm(root, { recursive: true, force: true })
      }
    },
    30_000,
  )
})

function directoryExists(directory: string) {
  return fs.stat(directory).then(
    (stat) => stat.isDirectory(),
    () => false,
  )
}
