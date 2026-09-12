import { expect, test } from "bun:test"
import { Schema } from "effect"
import {
  JiraAccountId,
  JiraIssueKey,
  mapJiraCommentPage,
  mapJiraIssueDetail,
  mapJiraUser,
  mergeJiraComments,
} from "./issue"
import { issueDetailFixture } from "../fixtures/board"
import { adfToMarkdown } from "./adf"

const origin = "https://example.atlassian.net"

test("issue context preserves relationship direction, hierarchy, attachment metadata and reporter photos", () => {
  const related = {
    key: "SHOP-618",
    fields: {
      summary: "Gallery API",
      status: { name: "Done", statusCategory: { key: "done" } },
      issuetype: { name: "Task" },
    },
  }
  const result = mapJiraIssueDetail(
    {
      ...issueDetailFixture,
      fields: {
        ...issueDetailFixture.fields,
        reporter: {
          accountId: "reporter",
          displayName: "Product team",
          avatarUrls: { "48x48": `${origin}/avatar.png` },
        },
        parent: related,
        subtasks: [related, { key: "../invalid" }],
        issuelinks: [
          { id: "in", type: { inward: "is blocked by", outward: "blocks" }, inwardIssue: related },
          { id: "out", type: { inward: "is blocked by", outward: "blocks" }, outwardIssue: related },
        ],
        attachment: [
          { id: "100", filename: "capture.png", mimeType: "image/png", size: 42, content: "https://untrusted.invalid" },
        ],
      },
    },
    origin,
  )
  expect(result?.reporter?.avatarUrl).toBe(`${origin}/avatar.png`)
  expect(result?.links.map((link) => link.relationship)).toEqual(["is blocked by", "blocks"])
  expect(result?.parent?.key).toBe("SHOP-618")
  expect(result?.subtasks).toHaveLength(1)
  expect(result?.subtasks[0]?.statusCategory).toBe("done")
  expect(result?.attachments).toEqual([{ id: "100", filename: "capture.png", mimeType: "image/png", size: 42 }])
})

test("file media resolves exact or unique filenames without confusing media UUIDs and attachment IDs", () => {
  const document = {
    type: "doc",
    content: [
      {
        type: "mediaSingle",
        content: [{ type: "media", attrs: { id: "media-uuid", type: "file", __fileName: "capture.png" } }],
      },
    ],
  }
  const attachment = { id: "100", filename: "capture.png", mimeType: "image/png", size: 42 }
  expect(adfToMarkdown(document, [attachment])).toBe("[capture.png](#jira-attachment-100)")
  expect(adfToMarkdown(document, [attachment, { ...attachment, id: "101" }])).toBe("*capture.png*")
})
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
