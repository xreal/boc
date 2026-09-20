import { describe, expect, test } from "bun:test"
import type { SessionInfo } from "@opencode/client/promise"
import type { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import type { Tab } from "@/shell/tabs/tabs"
import { resolveProjectTabGroup, reverseProjectTabGroups } from "./project-tabs"

describe("reverseProjectTabGroups", () => {
  const projects = new Map([
    ["alpha-old", "alpha"],
    ["alpha-new", "alpha"],
    ["beta-old", "beta"],
    ["beta-new", "beta"],
  ])

  test("shows newest tabs first within each project", () => {
    expect(
      reverseProjectTabGroups(
        ["alpha-old", "beta-old", "alpha-new", "beta-new"],
        (tab) => projects.get(tab)!,
        ["beta", "alpha"],
      ),
    ).toEqual(["beta-new", "beta-old", "alpha-new", "alpha-old"])
  })

  test("translates displayed tabs back to storage order", () => {
    expect(
      reverseProjectTabGroups(
        ["beta-new", "beta-old", "alpha-new", "alpha-old"],
        (tab) => projects.get(tab)!,
        ["beta", "alpha"],
      ),
    ).toEqual(["beta-old", "beta-new", "alpha-old", "alpha-new"])
  })
})

describe("resolveProjectTabGroup", () => {
  const server = "local\nhttp://localhost:4096" as ServerConnection.Key
  const boc: LocalProject = { id: "boc", worktree: "/repo/boc", expanded: false }
  const defaults: LocalProject = { id: "default", worktree: "/docs/Default Project", expanded: false }
  const projects = [defaults, boc]

  const draft = (directory: string): Tab => ({ type: "draft", draftID: "draft", server, directory })
  const sessionTab = (sessionId: string): Tab => ({ type: "session", server, sessionId })
  const session = (id: string, projectID: string, directory: string) =>
    ({ id, projectID, location: { directory }, time: { created: 1, updated: 1 } }) as SessionInfo

  test("keeps a draft and its promoted session in the same group", () => {
    const fromDraft = resolveProjectTabGroup({
      server,
      tab: draft("/repo/boc"),
      session: undefined,
      pendingDirectory: undefined,
      rememberedDirectory: undefined,
      projects,
      untitled: "Session",
    })
    const fromSession = resolveProjectTabGroup({
      server,
      tab: sessionTab("new"),
      session: session("new", "boc", "/repo/boc"),
      pendingDirectory: "/repo/boc",
      rememberedDirectory: undefined,
      projects,
      untitled: "Session",
    })
    expect(fromDraft.key).toBe(fromSession.key)
    expect(fromSession.name).toBe("boc")
  })

  test("keeps a pending session in its draft project until the session arrives", () => {
    const pending = resolveProjectTabGroup({
      server,
      tab: sessionTab("new"),
      session: undefined,
      pendingDirectory: "/repo/boc",
      rememberedDirectory: undefined,
      projects,
      untitled: "Session",
    })
    const arrived = resolveProjectTabGroup({
      server,
      tab: sessionTab("new"),
      session: session("new", "boc", "/repo/boc"),
      pendingDirectory: undefined,
      rememberedDirectory: undefined,
      projects,
      untitled: "Session",
    })
    expect(pending.key).toBe(arrived.key)
  })

  test("falls back to persisted info without leaving the project", () => {
    const remembered = resolveProjectTabGroup({
      server,
      tab: sessionTab("known"),
      session: undefined,
      pendingDirectory: undefined,
      rememberedDirectory: "/docs/Default Project",
      projects,
      untitled: "Session",
    })
    const live = resolveProjectTabGroup({
      server,
      tab: sessionTab("known"),
      session: session("known", "default", "/docs/Default Project"),
      pendingDirectory: undefined,
      rememberedDirectory: "/docs/Default Project",
      projects,
      untitled: "Session",
    })
    expect(remembered.key).toBe(live.key)
    expect(live.name).toBe("Default Project")
  })

  test("groups an unknown directory by path and an empty one as untitled", () => {
    const unknown = resolveProjectTabGroup({
      server,
      tab: sessionTab("stray"),
      session: undefined,
      pendingDirectory: undefined,
      rememberedDirectory: "/elsewhere/work",
      projects,
      untitled: "Session",
    })
    expect(unknown.key).toBe(JSON.stringify([server, "/elsewhere/work"]))
    expect(unknown.name).toBe("work")
    const empty = resolveProjectTabGroup({
      server,
      tab: sessionTab("ghost"),
      session: undefined,
      pendingDirectory: undefined,
      rememberedDirectory: undefined,
      projects,
      untitled: "Session",
    })
    expect(empty.key).toBe(JSON.stringify([server, null]))
    expect(empty.name).toBe("Session")
  })
})
