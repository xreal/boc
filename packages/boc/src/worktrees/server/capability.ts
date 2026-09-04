import type { RiftCapability } from "../shared/capability"
import { RIFT_BACKEND_VERSION } from "../shared/capability"
import type { CommandRunner } from "./command"
import { runCommand } from "./command"
import fs from "node:fs/promises"
import path from "node:path"

export type RiftCapabilityOptions = {
  binary?: string
  directory: string
  platform?: NodeJS.Platform
  arch?: string
  run?: CommandRunner
}

export async function inspectRiftCapability(options: RiftCapabilityOptions): Promise<RiftCapability> {
  const platform = options.platform ?? process.platform
  const arch = options.arch ?? process.arch
  if (platform !== "darwin" && platform !== "linux") {
    return unavailable("unsupported-platform", "Rift is available on macOS and Linux only.")
  }
  if ((platform === "darwin" && arch !== "arm64" && arch !== "x64") || (platform === "linux" && arch !== "x64")) {
    return unavailable("unsupported-architecture", `Rift is not bundled for ${platform} ${arch}.`)
  }
  if (!options.binary) return unavailable("binary-missing", "The bundled Rift executable is unavailable.")

  const health = await (options.run ?? runCommand)({
    executable: options.binary,
    args: ["--help"],
    timeoutMs: 10_000,
  })
  if (!health.ok) {
    return unavailable(
      health.reason === "not-found" ? "binary-missing" : "binary-unhealthy",
      health.reason === "not-found"
        ? "The bundled Rift executable is unavailable."
        : "The bundled Rift executable could not be started.",
    )
  }
  if (!health.stdout.includes("rift <COMMAND>") || !health.stdout.includes("create")) {
    return unavailable("binary-unhealthy", "The bundled Rift executable did not pass its capability check.")
  }

  const ancestor = await existingAncestor(options.directory).catch(() => undefined)
  if (!ancestor) return unavailable("storage-inaccessible", "The checkout storage location cannot be accessed.")
  const accessible = await fs
    .access(ancestor, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
    .then(() => true)
    .catch(() => false)
  if (!accessible) return unavailable("storage-inaccessible", "The checkout storage location is not writable.")

  const filesystem = await filesystemType(ancestor, platform, options.run ?? runCommand)
  if (!filesystem) return unavailable("storage-inaccessible", "The checkout filesystem could not be inspected.")
  if (platform === "darwin" && filesystem !== "apfs") {
    return unavailable("unsupported-filesystem", `Rift requires APFS; ${filesystem} was detected.`)
  }
  if (platform === "linux" && filesystem !== "btrfs") {
    return unavailable("unsupported-filesystem", `Rift requires btrfs in this version; ${filesystem} was detected.`)
  }
  return { available: true, backend: "boc/rift", version: RIFT_BACKEND_VERSION, filesystem }
}

async function existingAncestor(directory: string): Promise<string> {
  const resolved = path.resolve(directory)
  const stat = await fs.stat(resolved).then(
    () => resolved,
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error
      return undefined
    },
  )
  if (stat) return fs.realpath(stat)
  const parent = path.dirname(resolved)
  if (parent === resolved) throw new Error("No accessible ancestor")
  return existingAncestor(parent)
}

async function filesystemType(
  directory: string,
  platform: NodeJS.Platform,
  run: CommandRunner,
): Promise<string | undefined> {
  if (platform === "darwin") {
    const device = await run({ executable: "stat", args: ["-f", "%Sd", directory], timeoutMs: 10_000 })
    if (!device.ok || !device.stdout.trim()) return undefined
    const info = await run({ executable: "diskutil", args: ["info", device.stdout.trim()], timeoutMs: 10_000 })
    if (!info.ok) return undefined
    return info.stdout.match(/Type \(Bundle\):\s*([^\s]+)/i)?.[1]?.toLowerCase()
  }
  const result = await run({
    executable: "stat",
    args: ["-f", "-c", "%T", directory],
    timeoutMs: 10_000,
  })
  if (!result.ok) return undefined
  return result.stdout.trim().toLowerCase()
}

function unavailable(reason: Exclude<RiftCapability, { available: true }>["reason"], message: string): RiftCapability {
  return { available: false, backend: "boc/rift", version: RIFT_BACKEND_VERSION, reason, message }
}
