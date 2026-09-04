import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pin from "./pin.json" with { type: "json" }
import { isRiftTarget } from "./target"

const requested = Bun.argv[2] ?? `${process.platform}-${process.arch}`
if (!isRiftTarget(requested)) throw new Error(`Rift ${pin.version} is not pinned for ${requested}`)
const target = requested
const artifact = pin.targets[target]
const directory = path.dirname(fileURLToPath(import.meta.url))
const output = Bun.argv[3] ? path.resolve(Bun.argv[3]) : path.resolve(directory, "../../resources/rift", target, "rift")
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-fetch-"))

try {
  const response = await fetch(artifact.url, { redirect: "follow" })
  if (!response.ok) throw new Error(`Rift download failed with HTTP ${response.status}`)
  const archive = new Uint8Array(await response.arrayBuffer())
  const checksum = createHash("sha256").update(archive).digest("hex")
  if (checksum !== artifact.sha256) throw new Error(`Rift checksum mismatch for ${artifact.archive}`)

  const archivePath = path.join(temporary, artifact.archive)
  await Bun.write(archivePath, archive)
  const extracted = Bun.spawn(["tar", "-xzf", archivePath, "-C", temporary], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  })
  const exitCode = await extracted.exited
  if (exitCode !== 0) throw new Error(`Rift archive extraction failed: ${await new Response(extracted.stderr).text()}`)

  const staged = `${output}.tmp`
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.copyFile(path.join(temporary, "rift"), staged)
  await fs.chmod(staged, 0o755)
  if (target === `${process.platform}-${process.arch}`) {
    const health = Bun.spawn([staged, "--help"], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [healthCode, help, error] = await Promise.all([
      health.exited,
      new Response(health.stdout).text(),
      new Response(health.stderr).text(),
    ])
    if (healthCode !== 0 || !help.includes("Usage:") || !help.includes("<COMMAND>") || !help.includes("create")) {
      await fs.rm(staged, { force: true })
      throw new Error(`Rift ${target} failed its launch check${error.trim() ? `: ${error.trim()}` : ""}`)
    }
  }
  await fs.rename(staged, output)
  console.log(`Verified and staged Rift ${pin.version} (${pin.commit}) for ${target}`)
} finally {
  await fs.rm(temporary, { recursive: true, force: true })
}
