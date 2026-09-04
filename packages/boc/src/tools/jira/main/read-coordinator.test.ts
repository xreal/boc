import { describe, expect, test } from "bun:test"
import { createJiraReadCoordinator } from "./read-coordinator"

describe("Jira read coordinator", () => {
  test("aborts the stale read when a newer read starts in the same scope", async () => {
    const reads = createJiraReadCoordinator()
    let staleSignal: AbortSignal | undefined
    const stale = reads.run(
      "board",
      "stale",
      (signal) =>
        new Promise<string>((resolve) => {
          staleSignal = signal
          signal.addEventListener("abort", () => resolve("aborted"), { once: true })
        }),
    )
    const latest = reads.run("board", "latest", async () => "latest")

    expect(await stale).toBe("aborted")
    expect(staleSignal?.aborted).toBe(true)
    expect(await latest).toBe("latest")
  })

  test("keeps board and issue reads independent and only cancels the matching request", async () => {
    const reads = createJiraReadCoordinator()
    const board = new AbortController()
    const issue = new AbortController()
    const boardRead = reads.run("board", "board", async (signal) => {
      signal.addEventListener("abort", () => board.abort(), { once: true })
    })
    const issueRead = reads.run("issue", "issue", async (signal) => {
      signal.addEventListener("abort", () => issue.abort(), { once: true })
    })

    reads.cancel("board", "older-board")
    expect(board.signal.aborted).toBe(false)
    reads.cancel("board", "board")
    expect(board.signal.aborted).toBe(true)
    expect(issue.signal.aborted).toBe(false)
    reads.cancel("issue", "issue")
    expect(issue.signal.aborted).toBe(true)
    await Promise.all([boardRead, issueRead])
  })
})
