import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { createJiraHandlers, type JiraRuntime } from "./handlers"
import { memoryVault, sealToken } from "./credentials"
import { memoryJiraStore, readStoredConnection } from "./store"
import { JiraRpcs } from "../rpcs"
import { containsSecret } from "../domain/errors"
import {
  EMAIL_FIXTURE,
  SITE_FIXTURE,
  TOKEN_FIXTURE,
  authFailureResponse,
  fetchScript,
  jsonResponse,
  malformedResponse,
  myselfSuccessResponse,
  permissionFailureResponse,
  rateLimitResponse,
} from "../fixtures/http"
import {
  boardConfigurationResponse,
  boardListResponse,
  boardResponse,
  issueSearchResponse,
  sprintListResponse,
} from "../fixtures/board"

function runtime(overrides?: Partial<JiraRuntime> & { encryptionAvailable?: boolean }): JiraRuntime {
  return {
    store: overrides?.store ?? memoryJiraStore(),
    vault: overrides?.vault ?? memoryVault(overrides?.encryptionAvailable ?? true),
    fetch: overrides?.fetch ?? fetchScript(() => myselfSuccessResponse()),
    wait: overrides?.wait ?? (async () => undefined),
  }
}

function runJira<A>(jira: JiraRuntime, effect: Effect.Effect<A, never, unknown>) {
  return Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(createJiraHandlers(jira))) as Effect.Effect<A>,
  )
}

describe("Jira connection handlers", () => {
  test("saves a tested connection without persisting the token in plaintext", async () => {
    const jira = runtime()
    const payload = { site: SITE_FIXTURE, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE }

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        const tested = yield* client.BocJiraTestConnection(payload)
        const saved = yield* client.BocJiraSaveConnection(payload)
        const status = yield* client.BocJiraGetConnectionStatus()
        return { tested, saved, status }
      }),
    )

    expect(result.tested).toEqual({
      ok: true,
      status: "connected",
      site: SITE_FIXTURE,
      email: EMAIL_FIXTURE,
      displayName: "Mia Krystof",
    })
    expect(result.saved).toEqual(result.tested)
    expect(result.status).toEqual({
      status: "connected",
      encryptionAvailable: true,
      site: SITE_FIXTURE,
      email: EMAIL_FIXTURE,
      displayName: "Mia Krystof",
    })

    const stored = readStoredConnection(jira.store)
    expect(stored?.tokenCiphertext).toBeTruthy()
    expect(stored?.tokenCiphertext).not.toContain(TOKEN_FIXTURE)
    expect(JSON.stringify(jira.store.read())).not.toContain(TOKEN_FIXTURE)
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("disconnects and reports not-configured", async () => {
    const jira = runtime()
    const payload = { site: SITE_FIXTURE, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE }

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        yield* client.BocJiraSaveConnection(payload)
        return yield* client.BocJiraDisconnect()
      }),
    )

    expect(result).toEqual({ status: "not-configured", encryptionAvailable: true })
    expect(readStoredConnection(jira.store)).toBeUndefined()
  })

  test("does not persist plaintext when encryption is unavailable", async () => {
    const jira = runtime({ encryptionAvailable: false })
    const payload = { site: SITE_FIXTURE, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE }

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        const tested = yield* client.BocJiraTestConnection(payload)
        const saved = yield* client.BocJiraSaveConnection(payload)
        const status = yield* client.BocJiraGetConnectionStatus()
        return { tested, saved, status }
      }),
    )

    expect(result.tested.ok).toBe(true)
    expect(result.saved).toEqual({ ok: false, category: "encryption-unavailable" })
    expect(result.status).toEqual({ status: "not-configured", encryptionAvailable: false })
    expect(jira.store.read()).toBeUndefined()
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("returns normalized auth, permission, malformed, and rate-limit failures", async () => {
    const cases = [
      { fetch: fetchScript(() => authFailureResponse()), category: "auth" as const },
      { fetch: fetchScript(() => permissionFailureResponse()), category: "permission" as const },
      { fetch: fetchScript(() => malformedResponse()), category: "malformed" as const },
      { fetch: fetchScript(() => rateLimitResponse(4)), category: "rate-limit" as const, retryAfterSeconds: 4 },
    ]

    for (const fixture of cases) {
      const jira = runtime({ fetch: fixture.fetch })
      const result = await runJira(
        jira,
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(JiraRpcs)
          return yield* client.BocJiraSaveConnection({
            site: SITE_FIXTURE,
            email: EMAIL_FIXTURE,
            token: TOKEN_FIXTURE,
          })
        }),
      )
      expect(result.ok).toBe(false)
      if (result.ok) throw new Error("expected failure")
      expect(result.category).toBe(fixture.category)
      if (fixture.retryAfterSeconds !== undefined) expect(result.retryAfterSeconds).toBe(fixture.retryAfterSeconds)
      expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
      expect(jira.store.read()).toBeUndefined()
    }
  })

  test("rejects a non-Cloud origin before fetching", async () => {
    let fetched = false
    const jira = runtime({
      fetch: async () => {
        fetched = true
        return myselfSuccessResponse()
      },
    })

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        return yield* client.BocJiraTestConnection({
          site: "https://jira.example.com",
          email: EMAIL_FIXTURE,
          token: TOKEN_FIXTURE,
        })
      }),
    )

    expect(fetched).toBe(false)
    expect(result).toEqual({ ok: false, category: "invalid-site" })
  })

  test("keeps a saved connection after a new runtime attaches to the same store", async () => {
    const store = memoryJiraStore()
    const vault = memoryVault()
    const first = runtime({ store, vault })
    await runJira(
      first,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        return yield* client.BocJiraSaveConnection({
          site: SITE_FIXTURE,
          email: EMAIL_FIXTURE,
          token: TOKEN_FIXTURE,
        })
      }),
    )

    const second = runtime({ store, vault, fetch: async () => new Response("unused", { status: 500 }) })
    const status = await runJira(
      second,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        return yield* client.BocJiraGetConnectionStatus()
      }),
    )
    expect(status.status).toBe("connected")
    if (status.status !== "connected") throw new Error("expected connected")
    expect(status.email).toBe(EMAIL_FIXTURE)
    expect(JSON.stringify(status)).not.toContain(TOKEN_FIXTURE)
  })

  test("ignores a stored ciphertext that cannot be decrypted", async () => {
    const store = memoryJiraStore({
      site: SITE_FIXTURE,
      email: EMAIL_FIXTURE,
      displayName: "Mia",
      tokenCiphertext: "not-valid-ciphertext",
    })
    const jira = runtime({ store })
    const status = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        return yield* client.BocJiraGetConnectionStatus()
      }),
    )
    expect(status.status).toBe("not-configured")
    expect(JSON.stringify(status)).not.toContain(TOKEN_FIXTURE)
  })
})

describe("Jira board handlers", () => {
  test("lists boards and issues from a stored connection without returning the token", async () => {
    const vault = memoryVault()
    const store = memoryJiraStore({
      site: SITE_FIXTURE,
      email: EMAIL_FIXTURE,
      displayName: "Mia Krystof",
      tokenCiphertext: sealToken(vault, TOKEN_FIXTURE)!,
    })
    const requested: string[] = []
    const jira = runtime({
      store,
      vault,
      fetch: fetchScript((url, init) => {
        requested.push(`${init?.method ?? "GET"} ${url.pathname}`)
        expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Basic /)
        if (url.pathname === "/rest/agile/1.0/board") {
          return url.searchParams.get("startAt") === "2" ? boardListResponse(2) : boardListResponse(1)
        }
        if (url.pathname === "/rest/agile/1.0/board/84/configuration") return boardConfigurationResponse()
        if (url.pathname === "/rest/agile/1.0/board/84/sprint") return sprintListResponse()
        if (url.pathname === "/rest/agile/1.0/board/84") return boardResponse()
        if (url.pathname === "/rest/api/3/search/jql") {
          const body = init?.body ? JSON.parse(String(init.body)) : {}
          return issueSearchResponse(body.nextPageToken === "page-2" ? 2 : 1)
        }
        return jsonResponse(404, {})
      }),
    })

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        const boards = yield* client.BocJiraListBoards({ requestId: "boards" })
        const board = yield* client.BocJiraGetBoard({ requestId: "board", boardId: 84 })
        const issues = yield* client.BocJiraListIssues({ requestId: "issues", boardId: 84, sprintId: 37 })
        return { boards, board, issues }
      }),
    )

    expect(result.boards.ok).toBe(true)
    expect(result.board.ok).toBe(true)
    expect(result.issues.ok).toBe(true)
    if (!result.boards.ok || !result.board.ok || !result.issues.ok) throw new Error("expected board reads")
    expect(result.boards.boards.map((board) => board.id)).toEqual([84, 92, 101])
    expect(result.board.board.columns).toHaveLength(3)
    expect(result.issues.issues.map((issue) => issue.key)).toEqual(["PLAT-1", "PLAT-2"])
    expect(requested.some((entry) => entry === "POST /rest/api/3/search/jql")).toBe(true)
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("refuses board reads without a stored connection", async () => {
    const result = await runJira(
      runtime(),
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        return yield* client.BocJiraListBoards({ requestId: "boards" })
      }),
    )
    expect(result).toEqual({ ok: false, category: "auth" })
  })

  test("saves at most ten unique boards and clears them on disconnect", async () => {
    const vault = memoryVault()
    const store = memoryJiraStore({
      site: SITE_FIXTURE,
      email: EMAIL_FIXTURE,
      displayName: "Mia",
      tokenCiphertext: sealToken(vault, TOKEN_FIXTURE)!,
    })
    const jira = runtime({ store, vault })
    const savedBoards = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      name: `Board ${index + 1}`,
      type: "kanban" as const,
    }))

    const result = await runJira(
      jira,
      Effect.gen(function* () {
        const client = yield* RpcTest.makeClient(JiraRpcs)
        const saved = yield* client.BocJiraSavePreferences({ savedBoards, defaultBoardId: 3 })
        const loaded = yield* client.BocJiraGetPreferences()
        yield* client.BocJiraDisconnect()
        const after = yield* client.BocJiraGetPreferences()
        return { saved, loaded, after }
      }),
    )

    expect(result.saved.savedBoards).toHaveLength(10)
    expect(result.saved.defaultBoardId).toBe(3)
    expect(result.loaded).toEqual(result.saved)
    expect(result.after).toEqual({ savedBoards: [] })
  })
})

test("keeps multiple ticket sessions across handler restarts and disconnects without exposing drafts or other sites", async () => {
  const jira = runtime()
  const issueUrl = `${SITE_FIXTURE}/browse/APP-42`
  const draft = { issueUrl, title: "APP-42: Fix checkout", draftID: "draft-1", server: "server-a", createdAt: 1 }
  const links = await runJira(
    jira,
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(JiraRpcs)
      yield* client.BocJiraSaveSessionLink(draft)
      expect(yield* client.BocJiraListSessionLinks({ issueUrl })).toEqual([])
      yield* client.BocJiraPromoteSessionLink({ draftID: draft.draftID, server: "server-b", sessionID: "session-1" })
      // A delayed save or repeated promotion must not turn a real session back into a draft or replace it.
      yield* client.BocJiraSaveSessionLink(draft)
      yield* client.BocJiraPromoteSessionLink({
        draftID: draft.draftID,
        server: "server-a",
        sessionID: "session-other",
      })
      yield* client.BocJiraSaveSessionLink({ ...draft, draftID: "draft-2", createdAt: 2 })
      yield* client.BocJiraPromoteSessionLink({ draftID: "draft-2", server: "server-a", sessionID: "session-2" })
      yield* client.BocJiraSaveSessionLink({
        ...draft,
        draftID: "draft-3",
        issueUrl: "https://other.atlassian.net/browse/APP-42",
      })
      yield* client.BocJiraPromoteSessionLink({ draftID: "draft-3", server: "server-a", sessionID: "session-3" })
      yield* client.BocJiraSaveSessionLink({ ...draft, draftID: "abandoned" })
      yield* client.BocJiraPromoteSessionLink({ draftID: "unrelated", server: "server-a", sessionID: "unrelated" })
      return yield* client.BocJiraListSessionLinks({ issueUrl })
    }),
  )
  expect(links).toEqual([
    { ...draft, server: "server-b", sessionID: "session-1" },
    { ...draft, draftID: "draft-2", sessionID: "session-2", createdAt: 2 },
  ])
  const restored = await runJira(
    jira,
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(JiraRpcs)
      yield* client.BocJiraDisconnect()
      return yield* client.BocJiraListSessionLinks({ issueUrl })
    }),
  )
  expect(restored).toEqual(links)
})
