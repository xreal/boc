import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { bocCliStage } from "./cli-stage"

test("stages changed Boc artifacts separately even when their server versions match", async () => {
  const directory = await mkdtemp(join(tmpdir(), "boc-cli-stage-"))
  try {
    const file = join(directory, "backend")
    await writeFile(file, "old backend")
    const old = await bocCliStage(file, "1.2.3")
    expect(await bocCliStage(file, "1.2.3")).toBe(old)
    await writeFile(file, "backend with native controls")
    expect(await bocCliStage(file, "1.2.3")).not.toBe(old)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
