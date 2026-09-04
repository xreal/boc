import { expect, test } from "bun:test"
import { Glob } from "bun"
import path from "node:path"

test("keeps renderer source free of Electron imports", async () => {
  const rendererFiles = [
    ...new Glob("src/renderer/**/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    ...new Glob("src/desktop/renderer/**/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    ...new Glob("src/tools/**/renderer/**/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    ...new Glob("src/tools/**/extension.tsx").scanSync({ cwd: path.resolve(import.meta.dir, "../..") }),
    "src/registry.ts",
  ]

  const sources = await Promise.all(
    rendererFiles.filter((file) => !file.endsWith("boundary.test.ts")).map((file) => Bun.file(file).text()),
  )

  expect(
    sources.every(
      (source) => !/from\s+["']electron["']/.test(source) && !/from\s+["']electron-store["']/.test(source),
    ),
  ).toBe(true)
})
