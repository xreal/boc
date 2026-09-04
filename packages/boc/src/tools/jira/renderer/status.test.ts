import { describe, expect, test } from "bun:test"
import { createBocTranslator } from "../../../renderer/i18n"
import { TOKEN_FIXTURE } from "../fixtures/http"
import { jiraConnectionMessage, jiraConnectionMessageKind, jiraStatusLabel } from "./status"

const t = createBocTranslator(() => "en")

describe("Jira connection copy", () => {
  test("renders every status without a token", () => {
    const connected = jiraStatusLabel(t, {
      status: "connected",
      encryptionAvailable: true,
      site: "acme",
      email: "mia@example.com",
      displayName: "Mia Krystof",
    })
    const unavailable = jiraStatusLabel(t, {
      status: "encryption-unavailable",
      encryptionAvailable: false,
      site: "acme",
      email: "mia@example.com",
    })

    expect(connected).toBe("Connected · mia@example.com · acme")
    expect(unavailable).toBe("Secure storage unavailable")
    expect(jiraStatusLabel(t, { status: "not-configured", encryptionAvailable: true })).toBe("Not configured")
    expect(connected).not.toContain(TOKEN_FIXTURE)
    expect(unavailable).not.toContain(TOKEN_FIXTURE)
  })

  test("maps test, save, and error states to dictionary copy", () => {
    expect(jiraConnectionMessage(t, { busy: "test" })).toBe("Testing…")
    expect(jiraConnectionMessage(t, { busy: "save" })).toBe("Saving…")
    expect(jiraConnectionMessage(t, { busy: false, notice: "saved" })).toBe("Connection saved")
    expect(
      jiraConnectionMessage(t, {
        busy: false,
        attempt: { ok: true, status: "connected", site: "acme", email: "mia@example.com", displayName: "Mia" },
      }),
    ).toBe("Connection succeeded")
    expect(jiraConnectionMessage(t, { busy: false, attempt: { ok: false, category: "auth" } })).toBe(
      "Authentication failed. Check the email and API token.",
    )
    expect(
      jiraConnectionMessage(t, {
        busy: false,
        attempt: { ok: false, category: "rate-limit", retryAfterSeconds: 9 },
      }),
    ).toBe("Jira rate-limited the request. Try again in 9 seconds.")
    expect(
      jiraConnectionMessage(t, {
        busy: false,
        attempt: { ok: false, category: "auth", token: TOKEN_FIXTURE } as never,
      }),
    ).not.toContain(TOKEN_FIXTURE)
  })

  test("uses feedback kinds for outcome states", () => {
    expect(jiraConnectionMessageKind({ busy: false, attempt: { ok: true, status: "connected", site: "acme", email: "a", displayName: "A" } })).toBe(
      "success",
    )
    expect(jiraConnectionMessageKind({ busy: false, attempt: { ok: false, category: "permission" } })).toBe("danger")
    expect(
      jiraConnectionMessageKind({
        busy: false,
        status: { status: "encryption-unavailable", encryptionAvailable: false },
      }),
    ).toBe("warning")
  })
})
