import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"

// Boc releases can share the official compatibility version while containing
// different backend features. Stage the actual bundled artifact, not just its version.
export async function bocCliStage(source: string, version: string) {
  const hash = createHash("sha256")
  for await (const chunk of createReadStream(source)) hash.update(chunk)
  return `${version}-boc-${hash.digest("hex").slice(0, 16)}`
}
