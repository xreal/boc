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
    sources.every((source) => !/from\s+["']electron["']/.test(source) && !/from\s+["']electron-store["']/.test(source)),
  ).toBe(true)
})

test("keeps Jira main code silent so raw responses and credentials cannot reach logs", async () => {
  const mainFiles = new Glob("src/tools/jira/main/*.{ts,tsx}").scanSync({ cwd: path.resolve(import.meta.dir, "../..") })
  const sources = await Promise.all(
    [...mainFiles].filter((file) => !file.endsWith(".test.ts")).map((file) => Bun.file(file).text()),
  )

  expect(sources.every((source) => !/\b(?:console|logger|log)\.(?:debug|error|info|log|warn)\s*\(/.test(source))).toBe(
    true,
  )
})

test("keeps deployment command execution behind the one reviewed no-shell boundary", async () => {
  const files = new Glob("src/tools/deployments/main/*.{ts,tsx}").scanSync({
    cwd: path.resolve(import.meta.dir, "../.."),
  })
  const production = [...files].filter((file) => !file.endsWith(".test.ts"))
  const commandRunner = production.find((file) => file.endsWith("command-runner.ts"))
  const otherSources = await Promise.all(
    production.filter((file) => file !== commandRunner).map((file) => Bun.file(file).text()),
  )

  expect(
    otherSources.every(
      (source) =>
        !/node:child_process/.test(source) &&
        !/Bun\.spawn/.test(source) &&
        !/\bexecFile\s*\(/.test(source) &&
        !/\bspawn\s*\(/.test(source),
    ),
  ).toBe(true)
  expect(commandRunner).toBeDefined()
  const source = await Bun.file(commandRunner!).text()
  expect(source).toContain("shell: false")
  expect(source).not.toMatch(/\bexec\s*\(/)
})

test("keeps deployment main code silent so command output and environments cannot reach logs", async () => {
  const files = new Glob("src/tools/deployments/main/*.{ts,tsx}").scanSync({
    cwd: path.resolve(import.meta.dir, "../.."),
  })
  const sources = await Promise.all(
    [...files].filter((file) => !file.endsWith(".test.ts")).map((file) => Bun.file(file).text()),
  )
  expect(sources.every((source) => !/\b(?:console|logger|log)\.(?:debug|error|info|log|warn)\s*\(/.test(source))).toBe(
    true,
  )
  expect(sources.every((source) => !/auth token|--show-token/.test(source))).toBe(true)
})
