import { describe, expect, test } from "bun:test"
import { Session } from "@opencode-ai/schema/session"
import { createWorktreePreparations } from "./preparation"

describe("worktree preparations", () => {
  test("tracks phases, bounded output, and completion", () => {
    const preparations = createWorktreePreparations()
    const operationID = Session.ID.create()
    const started = preparations.begin(operationID)

    expect(started.started).toBe(true)
    preparations.progress(operationID).phase("creating-rift-checkout")
    preparations.progress(operationID).output("x".repeat(70 * 1024))
    preparations.succeed(operationID, "/tmp/checkout")

    expect(preparations.read(operationID)).toMatchObject({
      status: "succeeded",
      phase: "creating-rift-checkout",
      directory: "/tmp/checkout",
      truncated: true,
    })
    expect(Buffer.byteLength(preparations.read(operationID)?.log ?? "")).toBeLessThanOrEqual(64 * 1024)
  })

  test("does not restart an existing operation", () => {
    const preparations = createWorktreePreparations()
    const operationID = Session.ID.create()

    expect(preparations.begin(operationID).started).toBe(true)
    expect(preparations.begin(operationID).started).toBe(false)
  })
})
