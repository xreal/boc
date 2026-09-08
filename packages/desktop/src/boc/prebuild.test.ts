import { expect, test } from "bun:test"
import path from "node:path"

test("requires a fork-built CLI for Boc desktop builds", async () => {
  const root = path.resolve(import.meta.dirname, "../..")
  const prebuild = Bun.spawn([process.execPath, "../boc/scripts/desktop/prebuild.ts"], {
    cwd: root,
    env: { ...process.env, OPENCODE_CHANNEL: "boc", OPENCODE_CLI_DIST: "" },
    stdout: "ignore",
    stderr: "pipe",
  })
  expect(await prebuild.exited).not.toBe(0)
  expect(await new Response(prebuild.stderr).text()).toContain("OPENCODE_CLI_DIST is required for boc desktop builds")
})
