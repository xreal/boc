import { describe, expect, test } from "bun:test"
import { Option, Schema } from "effect"
import {
  JiraBoardResult,
  JiraBoardsResult,
  JiraConnectionAttempt,
  JiraConnectionStatus,
  JiraIssueResult,
  JiraIssuesResult,
  JiraPreferences,
  JiraRpcs,
} from "./rpcs"
import { TOKEN_FIXTURE } from "./fixtures/http"
import { mapJiraIssueDetail } from "./domain/issue"

const schemas = [
  JiraConnectionStatus,
  JiraConnectionAttempt,
  JiraBoardsResult,
  JiraBoardResult,
  JiraIssuesResult,
  JiraIssueResult,
  JiraPreferences,
]

describe("Jira RPC success schemas", () => {
  test("mapped tickets serialize when optional fields and related-ticket metadata are absent", () => {
    const related = { key: "PLAT-2", fields: { summary: "Related ticket" } }
    for (const context of [
      {},
      {
        parent: related,
        subtasks: [related],
        issuelinks: [{ id: "1", type: { inward: "is blocked by", outward: "blocks" }, outwardIssue: related }],
        customfield_10016: 0,
      },
    ]) {
      const issue = mapJiraIssueDetail(
        {
          id: "10001",
          key: "PLAT-1",
          fields: { summary: "Ticket without optional metadata", assignee: null, ...context },
        },
        "https://acme.atlassian.net",
        ["customfield_10016"],
      )
      expect(issue).toBeDefined()
      if (!issue) throw new Error("Expected mapped ticket")
      const result = { ok: true as const, issue }
      const encoded = Schema.encodeUnknownSync(JiraIssueResult)(result)
      expect(Schema.decodeUnknownSync(JiraIssueResult)(encoded)).toEqual(result)
      expect(issue?.storyPoints).toBe(context.customfield_10016)
    }
  })

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
    for (const schema of schemas) {
      expect(JSON.stringify(schema.ast)).not.toMatch(/apiToken|"token"|Authorization|rawBody|responseBody/i)
    }
  })

  test("strips unexpected Jira body and credential fields from decoded successes", () => {
    const decoded = Schema.decodeUnknownSync(JiraIssueResult)({
      ok: true,
      issue: {
        id: "10001",
        key: "PLAT-1",
        summary: "Safe summary",
        assignee: null,
        labels: [],
        subtasks: [],
        links: [],
        attachments: [],
        url: "https://acme.atlassian.net/browse/PLAT-1",
        token: TOKEN_FIXTURE,
        Authorization: `Basic ${TOKEN_FIXTURE}`,
      },
      rawBody: `raw ${TOKEN_FIXTURE}`,
    })

    expect(decoded).toEqual({
      ok: true,
      issue: {
        id: "10001",
        key: "PLAT-1",
        summary: "Safe summary",
        assignee: null,
        labels: [],
        subtasks: [],
        links: [],
        attachments: [],
        url: "https://acme.atlassian.net/browse/PLAT-1",
      },
    })
    expect(JSON.stringify(decoded)).not.toContain(TOKEN_FIXTURE)
  })

  test("registers connection and read-only board operations", () => {
    expect([...JiraRpcs.requests.keys()]).toEqual([
      "BocJiraListBranches",
      "BocJiraPreviewAttachment",
      "BocJiraDownloadAttachment",
      "BocJiraListComments",
      "BocJiraSearchAssignees",
      "BocJiraAssignIssue",
      "BocJiraListPullRequests",
      "BocJiraCancelIssueResourceRead",
      "BocJiraGetSessionInstructions",
      "BocJiraSaveSessionInstructions",
      "BocJiraListSessionLinks",
      "BocJiraSaveSessionLink",
      "BocJiraPromoteSessionLink",
      "BocJiraGetConnectionStatus",
      "BocJiraTestConnection",
      "BocJiraSaveConnection",
      "BocJiraDisconnect",
      "BocJiraListBoards",
      "BocJiraGetBoard",
      "BocJiraListIssues",
      "BocJiraGetIssue",
      "BocJiraListIssueStatuses",
      "BocJiraCancelBoardRead",
      "BocJiraCancelIssueRead",
      "BocJiraGetPreferences",
      "BocJiraSavePreferences",
    ])
  })
})
