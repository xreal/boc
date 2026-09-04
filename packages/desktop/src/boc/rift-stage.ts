import { RIFT_BACKEND_VERSION } from "@boc/extensions/worktrees/shared"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function stageRift(options: { source: string; root: string; health?: (binary: string) => Promise<void> }) {
  const source = await fs.stat(options.source).catch(() => undefined)
  if (!source?.isFile() || source.size === 0) return undefined

  const directory = path.join(options.root, "bin", RIFT_BACKEND_VERSION)
  const destination = path.join(directory, "rift")
  const health = options.health ?? requireHealthyRift
  if (
    await health(destination).then(
      () => true,
      () => false,
    )
  )
    return destination

  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await fs.mkdir(directory, { recursive: true })
  try {
    await fs.copyFile(options.source, temporary)
    if (process.platform !== "win32") await fs.chmod(temporary, 0o755)
    await health(temporary)
    await fs.rename(temporary, destination)
    return destination
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

async function requireHealthyRift(binary: string) {
  const result = await execFileAsync(binary, ["--help"], { timeout: 10_000, windowsHide: true })
  if (!result.stdout.includes("Usage:") || !result.stdout.includes("<COMMAND>") || !result.stdout.includes("create")) {
    throw new Error("The bundled Rift executable did not pass its capability check.")
  }
}
