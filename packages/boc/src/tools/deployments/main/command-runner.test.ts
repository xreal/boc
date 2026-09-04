import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createDeploymentCommandRunner, packagedCommandEnvironment } from "./command-runner"

describe("deployment command runner", () => {
  test("passes argv, stdin, and an explicit inherited environment without a shell", async () => {
    const run = createDeploymentCommandRunner(() => ({ PATH: process.env.PATH, BOC_COMMAND_FIXTURE: "inherited" }))
    const result = await run({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdin.once('data', data => process.stdout.write(`${process.argv[1]}:${process.env.BOC_COMMAND_FIXTURE}:${data}`))",
        "literal;$(never-executed)",
      ],
      env: { BOC_COMMAND_FIXTURE: "overridden" },
      stdin: "payload",
    })

    expect(result.ok).toBe(true)
    expect(result.stdout).toBe("literal;$(never-executed):overridden:payload")
  })

  test("bounds output", async () => {
    const result = await createDeploymentCommandRunner()({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(4096))"],
      maxBytes: 128,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected bounded output failure")
    expect(result.reason).toBe("output-limit")
    expect(result.stdout.length).toBeLessThanOrEqual(128)
  })

  test("normalizes timeout and cancellation", async () => {
    const run = createDeploymentCommandRunner()
    const timedOut = await run({
      executable: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1000)"],
      timeoutMs: 20,
    })
    expect(timedOut.ok).toBe(false)
    if (timedOut.ok) throw new Error("expected timeout")
    expect(timedOut.reason).toBe("timeout")

    const controller = new AbortController()
    const cancelled = run({
      executable: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1000)"],
      signal: controller.signal,
    })
    controller.abort()
    const result = await cancelled
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected cancellation")
    expect(result.reason).toBe("cancelled")
  })

  test("keeps the packaged environment concrete and preserves PATH", () => {
    expect(
      packagedCommandEnvironment(
        { PATH: "/opt/tools:/usr/bin", OMITTED: undefined },
        { EXTRA: "yes", OMITTED: undefined },
      ),
    ).toEqual({ PATH: "/opt/tools:/usr/bin", EXTRA: "yes" })
  })

  test("removes AppImage paths that can poison native Linux tools", () => {
    expect(
      packagedCommandEnvironment({
        APPDIR: "/tmp/.mount_Boc123",
        APPIMAGE: "/opt/Boc.AppImage",
        PATH: "/tmp/.mount_Boc123/usr/bin:/home/user/bin:/usr/bin",
        LD_LIBRARY_PATH: "/tmp/.mount_Boc123/usr/lib:/usr/lib",
        XDG_DATA_DIRS: "/tmp/.mount_Boc123/usr/share:/usr/share",
        PYTHONHOME: "/tmp/.mount_Boc123/usr",
        PYTHONPATH: `/work/python${path.delimiter}/tmp/.mount_Boc123/usr/lib/python`,
      }),
    ).toEqual({
      PATH: "/home/user/bin:/usr/bin",
      LD_LIBRARY_PATH: "/usr/lib",
      XDG_DATA_DIRS: "/usr/share",
    })
  })
})
