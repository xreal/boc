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

  test("reports stdout and stderr while retaining the command result", async () => {
    const output: string[] = []
    const result = await runCommand({
      executable: process.execPath,
      args: ["-e", 'console.log("checkout"); console.error("stack")'],
      onOutput: (value) => output.push(value),
    })

    expect(result.ok).toBe(true)
    expect(output.join("")).toContain("checkout")
    expect(output.join("")).toContain("stack")
    expect(result.stdout).toContain("checkout")
    expect(result.stderr).toContain("stack")
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
