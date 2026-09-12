import { createWriteStream } from "node:fs"
import { rename, rm } from "node:fs/promises"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import type { JiraAttachmentDownloadResult } from "../rpcs"

export async function saveJiraAttachment(
  response: Response,
  destination: string,
): Promise<JiraAttachmentDownloadResult> {
  if (!response.body) return { ok: false, category: "network" }
  const temporary = `${destination}.${crypto.randomUUID()}.part`
  const reader = response.body.getReader()
  const content = Readable.from(
    (async function* () {
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) return
          yield chunk.value
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
    })(),
  )
  // Replace the selected file only after its complete download has reached disk.
  return pipeline(content, createWriteStream(temporary, { flags: "wx" }))
    .then(() => rename(temporary, destination))
    .then(
      () => ({ ok: true as const, saved: true }),
      async () => {
        await rm(temporary, { force: true }).catch(() => undefined)
        return { ok: false as const, category: "network" as const }
      },
    )
}
