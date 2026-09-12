import { expect, test } from "bun:test"
import { assignJiraIssue, fetchJiraComments, fetchJiraIssueStatuses, searchJiraAssignees } from "./issue-client"
import { jiraRequest } from "./client"
import { parseJiraCloudSite } from "../domain/site"
import { fetchScript, EMAIL_FIXTURE, TOKEN_FIXTURE } from "../fixtures/http"
import { issueDetailFixture } from "../fixtures/board"

const origin = parseJiraCloudSite("example")
if (!origin) throw new Error("Invalid fixture site")
const credentials = { origin, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE }

test("comments request one newest-first bounded page", async () => {
  const calls: string[] = []
  const fetch = fetchScript((url) => {
    calls.push(url.toString())
    return Response.json({ startAt: 20, maxResults: 20, total: 20, comments: [] })
  })
  const result = await fetchJiraComments({ ...credentials, fetch }, { issueKey: "SHOP-617", startAt: 20 })
  expect(result.ok).toBe(true)
  expect(calls).toEqual([
    "https://example.atlassian.net/rest/api/3/issue/SHOP-617/comment?startAt=20&maxResults=20&orderBy=-created",
  ])
})

test("loads statuses for unique issue keys in one search request", async () => {
  const calls: { url: string; body: unknown }[] = []
  const result = await fetchJiraIssueStatuses(
    {
      ...credentials,
      fetch: fetchScript((url, init) => {
        calls.push({ url: url.toString(), body: init?.body ? JSON.parse(String(init.body)) : undefined })
        return Response.json({
          issues: [
            { key: "SHOP-617", fields: { status: { name: "In progress" } } },
            { key: "PLAT-1", fields: { status: { name: "Open" } } },
          ],
        })
      }),
    },
    ["SHOP-617", "PLAT-1", "shop-617"],
  )

  expect(result).toEqual({
    ok: true,
    statuses: [
      { key: "SHOP-617", statusName: "In progress" },
      { key: "PLAT-1", statusName: "Open" },
    ],
  })
  expect(calls).toEqual([
    {
      url: "https://example.atlassian.net/rest/api/3/search/jql",
      body: { jql: "issuekey in (SHOP-617, PLAT-1)", maxResults: 2, fields: ["status"] },
    },
  ])
})

test("assignable search preserves people with duplicate names and deduplicates IDs", async () => {
  const fetch = fetchScript((url) => {
    expect(url.searchParams.get("issueKey")).toBe("SHOP-617")
    expect(url.searchParams.get("query")).toBe("Dev")
    return Response.json([
      { accountId: "one", displayName: "Developer" },
      { accountId: "two", displayName: "Developer" },
      { accountId: "one", displayName: "Developer" },
    ])
  })
  const result = await searchJiraAssignees({ ...credentials, fetch }, { issueKey: "SHOP-617", query: " Dev " })
  expect(result.ok && result.users.map((user) => user.accountId)).toEqual(["one", "two"])
})

test("PUT and POST write policies make exactly one attempt and redact failures", async () => {
  for (const method of ["POST", "PUT"] as const) {
    for (const status of [400, 401, 403, 429, 500, 503]) {
      const calls: RequestInit[] = []
      const result = await jiraRequest({
        ...credentials,
        method,
        path: "/rest/api/3/issue/SHOP-617/assignee",
        retry: "write",
        fetch: fetchScript((_url, init) => {
          if (init) calls.push(init)
          return new Response(TOKEN_FIXTURE, { status, headers: { "Retry-After": "0" } })
        }),
      })
      expect(calls).toHaveLength(1)
      expect(result.ok ? undefined : result.outcome).toBe(status < 500 ? "rejected" : "unknown")
      expect(JSON.stringify(result)).not.toContain(TOKEN_FIXTURE)
    }
  }
})

test("lost transport and response-body failures have unknown write outcomes", async () => {
  const lost = await jiraRequest({
    ...credentials,
    method: "PUT",
    path: "/rest/api/3/issue/SHOP-617/assignee",
    retry: "write",
    fetch: async () => {
      throw new Error(TOKEN_FIXTURE)
    },
  })
  expect(lost).toEqual({ ok: false, category: "network", outcome: "unknown" })
})

test("assignment and unassignment read canonical state after one PUT", async () => {
  for (const accountId of ["account-owner", null]) {
    const calls: string[] = []
    const fetch = fetchScript((url, init) => {
      calls.push(init?.method ?? "GET")
      if (init?.method === "PUT") {
        expect(url.pathname).toBe("/rest/api/3/issue/PLAT-1/assignee")
        expect(JSON.parse(String(init.body))).toEqual({ accountId })
        return new Response(null, { status: 204 })
      }
      return Response.json({
        ...issueDetailFixture,
        fields: {
          ...issueDetailFixture.fields,
          assignee: accountId === null ? null : issueDetailFixture.fields.assignee,
        },
      })
    })
    const result = await assignJiraIssue({ ...credentials, fetch }, { issueKey: "PLAT-1", accountId })
    expect(result.ok && (result.issue.assignee?.accountId ?? null)).toBe(accountId)
    expect(calls).toEqual(["PUT", "GET"])
  }
})

test("unknown assignment reconciles but never repeats the PUT", async () => {
  const calls: string[] = []
  const fetch = fetchScript((_url, init) => {
    calls.push(init?.method ?? "GET")
    if (init?.method === "PUT") return new Response(null, { status: 503 })
    return Response.json(issueDetailFixture)
  })
  const result = await assignJiraIssue({ ...credentials, fetch }, { issueKey: "PLAT-1", accountId: "different-owner" })
  expect(result.ok ? undefined : result.outcome).toBe("unknown")
  expect("issue" in result && result.issue?.assignee?.accountId).toBe("account-owner")
  expect(calls).toEqual(["PUT", "GET"])
})

test("invalid mutation inputs never reach fetch", async () => {
  const fetch = fetchScript(() => {
    throw new Error("Unexpected fetch")
  })
  expect(await assignJiraIssue({ ...credentials, fetch }, { issueKey: "SHOP-617/evil", accountId: null })).toEqual({
    ok: false,
    category: "malformed",
    outcome: "rejected",
  })
  expect(await assignJiraIssue({ ...credentials, fetch }, { issueKey: "SHOP-617", accountId: "-1" })).toEqual({
    ok: false,
    category: "malformed",
    outcome: "rejected",
  })
})
