import { expect, test } from "bun:test"
import { Schema } from "effect"
import { JiraAccountId, JiraIssueKey, mapJiraCommentPage, mapJiraUser, mergeJiraComments } from "./issue"

const origin = "https://example.atlassian.net"
const comment = (id: string, hour: number) => ({
  id,
  created: `2026-09-12T${hour}:00:00Z`,
  updated: `2026-09-12T${hour}:00:00Z`,
  author: { accountId: id, displayName: "Platform team" },
  body: {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: `Discussion ${id}` }] }],
  },
})

test("comment pages preserve identities and chronology while skipping malformed entries", () => {
  const page = mapJiraCommentPage(
    { startAt: 0, maxResults: 3, total: 5, comments: [comment("new", 12), {}, comment("old", 10)] },
    origin,
  )
  expect(page?.comments.map((entry) => entry.id)).toEqual(["old", "new"])
  expect(page?.nextStartAt).toBe(3)
  expect(page?.comments[0]?.body).toBe("Discussion old")
  expect(mergeJiraComments(page?.comments ?? [], page?.comments ?? [])).toHaveLength(2)
  expect(mapJiraCommentPage({ startAt: 0, maxResults: 20, total: 1, comments: [] }, origin)).toBeUndefined()
  expect(mapJiraCommentPage({ comments: [] }, origin)).toBeUndefined()
  expect(mapJiraCommentPage({ startAt: 0, maxResults: 20, total: 0, comments: [] }, origin)?.nextStartAt).toBeNull()
})

test("people are keyed by account ID and only expose validated Jira avatars", () => {
  const first = mapJiraUser(
    { accountId: "one", displayName: "Developer", avatarUrls: { "48x48": "https://evil.invalid/avatar" } },
    origin,
  )
  const second = mapJiraUser({ accountId: "two", displayName: "Developer" }, origin)
  expect(first?.accountId).not.toBe(second?.accountId)
  expect(first?.avatarUrl).toBeUndefined()
  expect(mapJiraUser({ displayName: "Developer" }, origin)).toBeUndefined()
})

test("wire identifiers reject traversal, oversized keys, blank and automatic identities", () => {
  expect(Schema.is(JiraIssueKey)("SHOP-617")).toBe(true)
  for (const key of ["SHOP-617/assignee", " SHOP-617", `${"A".repeat(129)}-1`, "SHOP-617;ls"])
    expect(Schema.is(JiraIssueKey)(key)).toBe(false)
  for (const id of ["", "-1", " ", "a".repeat(256)]) expect(Schema.is(JiraAccountId)(id)).toBe(false)
})
