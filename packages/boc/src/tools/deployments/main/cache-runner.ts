import { StringDecoder } from "node:string_decoder"
import { DEPLOYMENT_ADMIN_TARGET, deploymentAdminDirectory } from "../domain/admin-server"
import type { AllowedDevEnvironment } from "../domain/environments"
import { spawnDeploymentStream } from "./command-runner"

export const CACHE_OUTPUT_LIMIT = 128 * 1024

export type CacheRunState = "running" | "succeeded" | "failed" | "unknown" | "resolved"

export type CacheRunSnapshot = {
  environment: AllowedDevEnvironment
  state: CacheRunState
  output: string
  startedAt: string
  finishedAt?: string
}

export type CacheProcess = {
  stdout: AsyncIterable<Uint8Array>
  stderr: AsyncIterable<Uint8Array>
  exited: Promise<number | { code: number | null; signal: NodeJS.Signals | null }>
}

export type CacheSpawn = (command: readonly string[]) => CacheProcess

export function createCacheRunner(launch: CacheSpawn = spawnDeploymentStream) {
  return (environment: AllowedDevEnvironment, onUpdate: (snapshot: CacheRunSnapshot) => void) => {
    const command = [
      "ssh",
      "-tt",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "ServerAliveInterval=15",
      "-o",
      "ServerAliveCountMax=3",
      DEPLOYMENT_ADMIN_TARGET,
      `cd ${deploymentAdminDirectory(environment)}/shop/tools/ && ./flush-cache.sh --full --hard`,
    ] as const
    const startedAt = new Date().toISOString()
    let output = ""
    let terminal = false
    const publish = (state: CacheRunState, finishedAt?: string) =>
      onUpdate({ environment, state, output, startedAt, ...(finishedAt ? { finishedAt } : {}) })
    const append = (value: string) => {
      if (terminal) return
      output = boundedPlainText(output + value)
      publish("running")
    }

    publish("running")
    try {
      const process = launch(command)
      void Promise.all([consume(process.stdout, append), consume(process.stderr, append), process.exited])
        .then(([, , exit]) => {
          const code = typeof exit === "number" ? exit : exit.code
          const state = typeof exit !== "number" && exit.signal ? "unknown" : code === 0 ? "succeeded" : code === 255 || code === null ? "unknown" : "failed"
          terminal = true
          publish(state, new Date().toISOString())
        })
        .catch((error) => {
          if (terminal) return
          append(`\n${error instanceof Error ? error.message : "SSH process ended unexpectedly"}\n`)
          terminal = true
          publish("unknown", new Date().toISOString())
        })
    } catch (error) {
      append(`\n${error instanceof Error ? error.message : "SSH process could not start"}\n`)
      publish("unknown", new Date().toISOString())
    }
  }
}

async function consume(stream: AsyncIterable<Uint8Array>, append: (value: string) => void) {
  const decoder = new StringDecoder("utf8")
  for await (const chunk of stream) append(decoder.write(Buffer.from(chunk)))
  const remaining = decoder.end()
  if (remaining) append(remaining)
}

function boundedPlainText(value: string) {
  const plain = value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
  if (Buffer.byteLength(plain) <= CACHE_OUTPUT_LIMIT) return plain
  const tail = Buffer.from(plain).subarray(-CACHE_OUTPUT_LIMIT).toString("utf8").replace(/^\uFFFD/, "")
  return `[Earlier output omitted]\n${tail}`
}
