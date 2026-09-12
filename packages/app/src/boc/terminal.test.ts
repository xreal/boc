import { describe, expect, test } from "bun:test"
import { ServerConnection } from "@/runtime/server/registry"
import type { SessionTab } from "@/shell/tabs/tabs"
import { findBocTerminalTarget } from "./terminal"

const local = { type: "http", http: { url: "http://localhost:4096" } } as const
const remote = { type: "http", http: { url: "https://opencode.example.com" } } as const
const first = session(local, "ses_first")
const latest = session(local, "ses_latest")

describe("Boc terminal target", () => {
  test("prefers the last visited open local session", () => {
    expect(findBocTerminalTarget([first, latest], [local, remote], first)).toBe(first)
  })

  test("falls back to the latest open local session and ignores remote sessions", () => {
    const remoteSession = session(remote, "ses_remote")
    expect(findBocTerminalTarget([first, latest, remoteSession], [local, remote])).toBe(latest)
  })

  test("requires a local session", () => {
    expect(findBocTerminalTarget([session(remote, "ses_remote")], [remote])).toBeUndefined()
  })
})

function session(server: ServerConnection.Any, sessionId: string): SessionTab {
  return { type: "session", server: ServerConnection.key(server), sessionId }
}
