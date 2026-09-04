import { describe, expect, test } from "bun:test"
import { containsSecret, failJira, jiraErrorFromHttpStatus, readRetryAfterSeconds, redactSecrets } from "./errors"
import { TOKEN_FIXTURE } from "../fixtures/http"

describe("jira error normalization", () => {
  test("maps HTTP statuses to categories", () => {
    expect(jiraErrorFromHttpStatus(400)).toBe("malformed")
    expect(jiraErrorFromHttpStatus(401)).toBe("auth")
    expect(jiraErrorFromHttpStatus(403)).toBe("permission")
    expect(jiraErrorFromHttpStatus(404)).toBe("not-found")
    expect(jiraErrorFromHttpStatus(429)).toBe("rate-limit")
    expect(jiraErrorFromHttpStatus(500)).toBe("network")
  })

  test("reads Retry-After as whole seconds", () => {
    expect(readRetryAfterSeconds("12")).toBe(12)
    expect(readRetryAfterSeconds("0")).toBe(0)
    expect(readRetryAfterSeconds("nope")).toBeUndefined()
    expect(readRetryAfterSeconds(null)).toBeUndefined()
  })

  test("never puts secrets into normalized failures", () => {
    const failure = failJira("auth")
    expect(JSON.stringify(failure)).not.toContain(TOKEN_FIXTURE)
    expect(failure).toEqual({ ok: false, category: "auth" })
  })
})

describe("secret redaction", () => {
  test("strips tokens and Authorization values from log text", () => {
    const raw = `Authorization: Basic abcdef== failed for token ${TOKEN_FIXTURE}; {"apiToken":"another-secret"}`
    const redacted = redactSecrets(raw, [TOKEN_FIXTURE])
    expect(containsSecret(redacted, [TOKEN_FIXTURE])).toBe(false)
    expect(redacted).toContain("[redacted]")
    expect(redacted).not.toContain("Basic abcdef==")
    expect(redacted).not.toContain("another-secret")
  })
})
