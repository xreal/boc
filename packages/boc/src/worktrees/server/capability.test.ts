import { describe, expect, test } from "bun:test"
import type { CommandRunner } from "./command"
import { inspectRiftCapability } from "./capability"

describe("Rift capability", () => {
  test("does not start a binary on unsupported hosts", async () => {
    let called = false
    const capability = await inspectRiftCapability({
      binary: "/opt/boc/rift",
      directory: "/tmp/checkouts",
      platform: "win32",
      arch: "x64",
      run: async () => {
        called = true
        return success("")
      },
    })

    expect(capability).toMatchObject({ available: false, reason: "unsupported-platform" })
    expect(called).toBe(false)
  })

  test("reports a missing bundled binary before inspecting storage", async () => {
    const capability = await inspectRiftCapability({
      directory: "/tmp/checkouts",
      platform: "darwin",
      arch: "arm64",
    })

    expect(capability).toMatchObject({ available: false, reason: "binary-missing" })
  })

  test("accepts a healthy binary on APFS", async () => {
    const run: CommandRunner = async (command) => {
      if (command.args[0] === "--help") return success("Usage: rift <COMMAND>\nCommands: create")
      if (command.executable === "stat") return success("disk3s5\n")
      return success("Type (Bundle): apfs\n")
    }
    const capability = await inspectRiftCapability({
      binary: "/opt/boc/rift",
      directory: "/tmp/checkouts/not-created-yet",
      platform: "darwin",
      arch: "arm64",
      run,
    })

    expect(capability).toEqual({ available: true, backend: "boc/rift", version: "0.0.10", filesystem: "apfs" })
  })

  test("keeps Linux support restricted to btrfs", async () => {
    const run: CommandRunner = async (command) =>
      command.args[0] === "--help" ? success("Usage: rift <COMMAND>\nCommands: create") : success("ext2/ext3\n")
    const capability = await inspectRiftCapability({
      binary: "/opt/boc/rift",
      directory: "/tmp/checkouts",
      platform: "linux",
      arch: "x64",
      run,
    })

    expect(capability).toMatchObject({ available: false, reason: "unsupported-filesystem" })
  })
})

function success(stdout: string) {
  return { ok: true as const, exitCode: 0 as const, stdout, stderr: "" }
}
