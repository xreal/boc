import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { RpcTest } from "effect/unstable/rpc"
import { createJiraHandlers, type JiraRuntime } from "./handlers"
import { memoryVault } from "./credentials"
import { memoryJiraStore, readStoredConnection } from "./store"
import { JiraRpcs } from "../rpcs"
import { containsSecret } from "../domain/errors"
import {
  EMAIL_FIXTURE,
  SITE_FIXTURE,
  TOKEN_FIXTURE,
  authFailureResponse,
  fetchScript,
  malformedResponse,
  myselfSuccessResponse,
  permissionFailureResponse,
  rateLimitResponse,
} from "../fixtures/http"

function runtime(overrides?: Partial<JiraRuntime> & { encryptionAvailable?: boolean }): JiraRuntime {
  return {
    store: overrides?.store ?? memoryJiraStore(),
    vault: overrides?.vault ?? memoryVault(overrides?.encryptionAvailable ?? true),
    fetch: overrides?.fetch ?? fetchScript(() => myselfSuccessResponse()),
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
