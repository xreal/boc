import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import { JiraConnectionAttempt, JiraConnectionStatus, JiraRpcs } from "./rpcs"
import { TOKEN_FIXTURE } from "./fixtures/http"

describe("Jira RPC success schemas", () => {
  test("do not name or keep an API token", () => {
    const status = Option.getOrUndefined(
      Schema.decodeUnknownOption(JiraConnectionStatus)({
        status: "connected",
        encryptionAvailable: true,
        site: "acme",
        email: "mia@example.com",
        displayName: "Mia Krystof",
        token: TOKEN_FIXTURE,
      }),
    )
    const attempt = Option.getOrUndefined(
      Schema.decodeUnknownOption(JiraConnectionAttempt)({
        ok: true,
        status: "connected",
        site: "acme",
        email: "mia@example.com",
        displayName: "Mia Krystof",
        token: TOKEN_FIXTURE,
      }),
    )

    if (status) {
      expect(JSON.stringify(status)).not.toContain(TOKEN_FIXTURE)
      expect("token" in status).toBe(false)
    }
    if (attempt) {
      expect(JSON.stringify(attempt)).not.toContain(TOKEN_FIXTURE)
      expect("token" in attempt).toBe(false)
    }
    expect(JSON.stringify(JiraConnectionStatus.ast)).not.toMatch(/apiToken|"token"/i)
    expect(JSON.stringify(JiraConnectionAttempt.ast)).not.toMatch(/apiToken|"token"/i)
  })

  test("registers the four connection operations", () => {
    expect([...JiraRpcs.requests.keys()]).toEqual([
      "BocJiraGetConnectionStatus",
      "BocJiraTestConnection",
      "BocJiraSaveConnection",
      "BocJiraDisconnect",
    ])
  })
})
