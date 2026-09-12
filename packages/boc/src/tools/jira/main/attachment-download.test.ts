import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { saveJiraAttachment } from "./attachment-download"

test("downloads replace the destination only on completion and clean up interrupted streams", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "boc-jira-download-"))
  const destination = path.join(directory, "attachment.bin")
  try {
    await Bun.write(destination, "original")
    const interrupted = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.error(new Error("Interrupted"))
        },
      }),
    )
    expect(await saveJiraAttachment(interrupted, destination)).toEqual({ ok: false, category: "network" })
    expect(await Bun.file(destination).text()).toBe("original")
    expect(await readdir(directory)).toEqual(["attachment.bin"])
    expect(await saveJiraAttachment(new Response(new Uint8Array([1, 2, 3, 4])), destination)).toEqual({
      ok: true,
      saved: true,
    })
    expect([...new Uint8Array(await Bun.file(destination).arrayBuffer())]).toEqual([1, 2, 3, 4])
    expect(await readdir(directory)).toEqual(["attachment.bin"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
