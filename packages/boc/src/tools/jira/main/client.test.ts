import { describe, expect, test } from "bun:test"
import { fetchJiraMyself } from "./client"
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
})
