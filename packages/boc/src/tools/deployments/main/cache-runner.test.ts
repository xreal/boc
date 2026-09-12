import { describe, expect, test } from "bun:test"
import { CACHE_OUTPUT_LIMIT, createCacheRunner, type CacheRunSnapshot } from "./cache-runner"
import { spawnDeploymentStream } from "./command-runner"

describe("cache runner", () => {
  test("uses the fixed SSH target and reports streamed UTF-8 output and success", async () => {
    const snapshots: CacheRunSnapshot[] = []
    let command: readonly string[] = []
    const finished = Promise.withResolvers<void>()
    createCacheRunner((value) => {
      command = value
      return {
        stdout: stream([new Uint8Array([0xe2, 0x82]), new Uint8Array([0xac, 0x0a])]),
        stderr: stream([new TextEncoder().encode("\u001b[31mflush\u001b[0m\n")]),
        exited: Promise.resolve(0),
      }
    })("02", (snapshot) => {
      snapshots.push(snapshot)
      if (snapshot.state !== "running") finished.resolve()
    })
    await finished.promise

    expect(command).toEqual([
      "ssh", "-tt", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15",
      "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=3",
      "bergfreunde@adminserver.dev.bergfreunde.io", "cd /var/www/dev-02.bergfreunde.de/shop/tools/ && ./flush-cache.sh --full --hard",
    ])
    expect(snapshots.at(-1)).toMatchObject({ state: "succeeded" })
    expect(snapshots.at(-1)?.output).toContain("€\n")
    expect(snapshots.at(-1)?.output).toContain("flush\n")
    expect(snapshots.at(-1)?.output).not.toContain("\u001b")
  })

  test("retains a bounded tail without stopping the mutation and treats SSH transport exit as unknown", async () => {
    const finished = Promise.withResolvers<CacheRunSnapshot>()
    createCacheRunner(() => ({
      stdout: stream([new TextEncoder().encode("x".repeat(CACHE_OUTPUT_LIMIT + 1000))]),
      stderr: stream([]),
      exited: Promise.resolve(255),
    }))("03", (snapshot) => {
      if (snapshot.state !== "running") finished.resolve(snapshot)
    })
    const snapshot = await finished.promise
    expect(snapshot.state).toBe("unknown")
    expect(Buffer.byteLength(snapshot.output)).toBeLessThanOrEqual(CACHE_OUTPUT_LIMIT + 64)
    expect(snapshot.output).toStartWith("[Earlier output omitted]\n")
  })

  test("bounds output from a real child process without terminating it", async () => {
    const finished = Promise.withResolvers<CacheRunSnapshot>()
    createCacheRunner(() =>
      spawnDeploymentStream([process.execPath, "-e", `process.stdout.write("x".repeat(${CACHE_OUTPUT_LIMIT + 4096}))`]),
    )("04", (snapshot) => {
      if (snapshot.state !== "running") finished.resolve(snapshot)
    })
    const snapshot = await finished.promise
    expect(snapshot.state).toBe("succeeded")
    expect(snapshot.output).toStartWith("[Earlier output omitted]\n")
  })

  test("reports stream errors and local signals as unknown without publishing a later running state", async () => {
    const snapshots: CacheRunSnapshot[] = []
    const finished = Promise.withResolvers<void>()
    createCacheRunner(() => ({
      stdout: (async function* () { throw new Error("stream closed") })(),
      stderr: stream([]),
      exited: Promise.resolve({ code: null, signal: "SIGTERM" }),
    }))("05", (snapshot) => {
      snapshots.push(snapshot)
      if (snapshot.state === "unknown") finished.resolve()
    })
    await finished.promise
    await Promise.resolve()
    expect(snapshots.at(-1)?.state).toBe("unknown")
    expect(snapshots.at(-1)?.output).toContain("stream closed")
  })
})

async function* stream(chunks: Uint8Array[]) {
  for (const chunk of chunks) yield chunk
}
