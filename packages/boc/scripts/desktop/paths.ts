import path from "node:path"
import { resolveRiftTarget } from "../rift/target"
import { fileURLToPath } from "node:url"

export const desktopDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../desktop")
export const bocResources = path.resolve(desktopDirectory, "../boc/resources")

export function riftResource(target: { os: string; cpu: string }) {
  const rift = resolveRiftTarget(target.os, target.cpu)
  if (rift) return { target: rift, file: path.join(bocResources, "rift", rift, "rift") }
}

// Electron Builder loads config in Node, while upstream's target helper imports Bun.
// Decode only the platform/CPU here; preparation uses the upstream target inventory.
export function packagingRift(target = process.env.OPENCODE_CLI_TARGET) {
  if (!target) return riftResource({ os: process.platform, cpu: process.arch })
  const cpu = target.startsWith("aarch64-") ? "arm64" : target.startsWith("x86_64-") ? "x64" : "unsupported"
  const os = target.endsWith("apple-darwin") ? "darwin" : target.endsWith("unknown-linux-gnu") ? "linux" : "unsupported"
  return riftResource({ os, cpu })
}
