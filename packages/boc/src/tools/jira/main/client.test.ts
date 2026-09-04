import { describe, expect, test } from "bun:test"
import { fetchJiraMyself, jiraRequest } from "./client"
import { parseJiraCloudSite } from "../domain/site"
import { containsSecret } from "../domain/errors"
import {
  TOKEN_FIXTURE,
  EMAIL_FIXTURE,
  authFailureResponse,
  captchaDeniedResponse,
  fetchScript,
  malformedResponse,
  myselfSuccessResponse,
  permissionFailureResponse,
  rateLimitResponse,
} from "../fixtures/http"

const origin = parseJiraCloudSite("acme")!

function callMyself(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  return fetchJiraMyself({
    origin,
    email: EMAIL_FIXTURE,
    token: TOKEN_FIXTURE,
    fetch: fetchScript(handler),
    wait: async () => undefined,
  })
}

describe("fetchJiraMyself", () => {
  test("decodes the current user from a successful Cloud response", async () => {
    let requested: { url: string; authorization?: string; redirect?: RequestRedirect } | undefined
    const result = await callMyself((url, init) => {
      requested = {
        url: url.toString(),
        authorization: new Headers(init?.headers).get("Authorization") ?? undefined,
        redirect: init?.redirect,
      }
      return myselfSuccessResponse()
    })

    expect(requested?.url).toBe("https://acme.atlassian.net/rest/api/3/myself")
    expect(requested?.redirect).toBe("error")
    expect(requested?.authorization?.startsWith("Basic ")).toBe(true)
    expect(result).toEqual({
      ok: true,
      user: {
        accountId: "5b10a2844c20165700ede21g",
        displayName: "Mia Krystof",
        emailAddress: "mia@example.com",
      },
    })
    expect(JSON.stringify(result)).not.toContain(TOKEN_FIXTURE)
  })

  test("normalizes auth, permission, malformed, and rate-limit failures without leaking the token", async () => {
    const auth = await callMyself(() => authFailureResponse())
    const permission = await callMyself(() => permissionFailureResponse())
    const malformed = await callMyself(() => malformedResponse())
    const rateLimit = await callMyself(() => rateLimitResponse(9))
    const captcha = await callMyself(() => captchaDeniedResponse())
    const network = await fetchJiraMyself({
      origin,
      email: EMAIL_FIXTURE,
      token: TOKEN_FIXTURE,
      fetch: async () => {
        throw new Error(`network down ${TOKEN_FIXTURE}`)
      },
      wait: async () => undefined,
    })

    expect(auth).toEqual({ ok: false, category: "auth" })
    expect(permission).toEqual({ ok: false, category: "permission" })
    expect(malformed).toEqual({ ok: false, category: "malformed" })
    expect(rateLimit).toEqual({ ok: false, category: "rate-limit", retryAfterSeconds: 9 })
    expect(captcha).toEqual({ ok: false, category: "auth" })
    expect(network).toEqual({ ok: false, category: "network" })

    for (const result of [auth, permission, malformed, rateLimit, captcha, network]) {
      expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
    }
  })

  test("retries Retry-After responses twice before succeeding", async () => {
    const waits: number[] = []
    let attempts = 0
    const result = await fetchJiraMyself({
      origin,
      email: EMAIL_FIXTURE,
      token: TOKEN_FIXTURE,
      fetch: fetchScript(() => {
        attempts += 1
        return attempts < 3 ? rateLimitResponse(2) : myselfSuccessResponse()
      }),
      wait: async (milliseconds) => {
        waits.push(milliseconds)
      },
    })

    expect(result.ok).toBe(true)
    expect(attempts).toBe(3)
    expect(waits).toEqual([2000, 2000])
  })

  test("does not retry an unsafe request or an excessive Retry-After delay", async () => {
    let unsafeAttempts = 0
    const unsafe = await jiraRequest({
      origin,
      email: EMAIL_FIXTURE,
      token: TOKEN_FIXTURE,
      fetch: fetchScript(() => {
        unsafeAttempts += 1
        return rateLimitResponse(1)
      }),
      method: "POST",
      path: "/rest/api/3/example-mutation",
    })
    let boundedAttempts = 0
    const bounded = await fetchJiraMyself({
      origin,
      email: EMAIL_FIXTURE,
      token: TOKEN_FIXTURE,
      fetch: fetchScript(() => {
        boundedAttempts += 1
        return rateLimitResponse(31)
      }),
      wait: async () => undefined,
    })

    expect(unsafe).toEqual({ ok: false, category: "rate-limit", retryAfterSeconds: 1 })
    expect(unsafeAttempts).toBe(1)
    expect(bounded).toEqual({ ok: false, category: "rate-limit", retryAfterSeconds: 31 })
    expect(boundedAttempts).toBe(1)
  })

  test("passes cancellation to fetch and normalizes an aborted read", async () => {
    const controller = new AbortController()
    let fetchSignal: AbortSignal | null | undefined
    const result = fetchJiraMyself({
      origin,
      email: EMAIL_FIXTURE,
      token: TOKEN_FIXTURE,
      signal: controller.signal,
      fetch: async (_input, init) => {
        fetchSignal = init?.signal
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error(TOKEN_FIXTURE)), { once: true })
        })
      },
    })

    controller.abort()

    expect(await result).toEqual({ ok: false, category: "network" })
    expect(fetchSignal).toBe(controller.signal)
  })
})
