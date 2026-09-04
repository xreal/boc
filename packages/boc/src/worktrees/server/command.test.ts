import { describe, expect, test } from "bun:test"
import { runCommand } from "./command"

describe("Rift command boundary", () => {
  test("passes arguments without a shell", async () => {
    const argument = "$(touch should-not-exist)"
    const result = await runCommand({
      executable: process.execPath,
      args: ["-e", "console.log(process.argv[1])", argument],
    })

    expect(result.ok).toBe(true)
    expect(result.stdout.trim()).toBe(argument)
  })

  test("bounds command output", async () => {
    const result = await runCommand({
      executable: process.execPath,
      args: ["-e", 'console.log("x".repeat(1024))'],
      maxBytes: 32,
    })

    expect(result).toMatchObject({ ok: false, reason: "output-limit" })
  })

  test("bounds command duration", async () => {
    const result = await runCommand({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 10_000)"],
      timeoutMs: 20,
    })

    expect(result).toMatchObject({ ok: false, reason: "timeout" })
  })
})
