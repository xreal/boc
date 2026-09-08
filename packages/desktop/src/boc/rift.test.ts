import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { developmentRiftSource, usesRiftRuntime } from "./development"
import { stageRift } from "./rift-stage"

test("enables Rift for the Boc source backend", () => {
  expect(usesRiftRuntime("dev", { OPENCODE_CHANNEL: "local", OPENCODE_DESKTOP_CLI_DEV: "packages/cli" })).toBe(true)
  expect(usesRiftRuntime("dev", { OPENCODE_CHANNEL: "local" })).toBe(false)
  expect(usesRiftRuntime("boc", {})).toBe(true)
})

test("stages and reuses a healthy versioned Rift executable", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-stage-"))
  const source = path.join(temporary, "source", "rift")
  const root = path.join(temporary, "user-data", "rift")
  let checks = 0
  const health = async (binary: string) => {
    checks++
    expect(await fs.readFile(binary, "utf8")).toBe("healthy rift")
  }
  try {
    await fs.mkdir(path.dirname(source), { recursive: true })
    await fs.writeFile(source, "healthy rift")

    const staged = await stageRift({ source, root, health })
    if (!staged) throw new Error("Expected Rift to be staged")
    expect(staged).toBe(path.join(root, "bin", "0.0.10", "rift"))
    expect(await fs.readFile(staged, "utf8")).toBe("healthy rift")

    expect(await stageRift({ source, root, health })).toBe(staged)
    expect(checks).toBe(3)
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})

test("leaves Rift unavailable when the packaged resource is missing", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-missing-"))
  try {
    expect(
      await stageRift({ source: path.join(temporary, "missing", "rift"), root: path.join(temporary, "root") }),
    ).toBeUndefined()
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})

const prepared = developmentRiftSource(path.resolve(import.meta.dirname, "../../resources"))
test.skipIf(!existsSync(prepared))("launches the prepared Rift artifact after staging", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-artifact-"))
  try {
    expect(await stageRift({ source: prepared, root: temporary })).toBe(path.join(temporary, "bin", "0.0.10", "rift"))
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
})
