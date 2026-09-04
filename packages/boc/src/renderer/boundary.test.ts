import { expect, test } from "bun:test"
import { Glob } from "bun"
import path from "node:path"

test("keeps renderer source free of Electron imports", async () => {
  const rendererFiles = [
    ...new Glob("src/renderer/**/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    ...new Glob("src/desktop/renderer/**/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    "src/registry.ts",
    "src/tools/jira/extension.tsx",
    "src/tools/jira/renderer/screen.tsx",
  ]

  const sources = await Promise.all(
    rendererFiles.filter((file) => !file.endsWith("boundary.test.ts")).map((file) => Bun.file(file).text()),
  )

  expect(sources.every((source) => !/from\s+["']electron["']/.test(source))).toBe(true)
})
