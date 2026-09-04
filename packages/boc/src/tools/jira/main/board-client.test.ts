import { describe, expect, test } from "bun:test"
import { fetchJiraBoard, fetchJiraBoardIssues, fetchJiraBoards, fetchJiraIssue } from "./board-client"
import { parseJiraCloudSite } from "../domain/site"
import { containsSecret } from "../domain/errors"
import {
  TOKEN_FIXTURE,
  EMAIL_FIXTURE,
  fetchScript,
  jsonResponse,
  rateLimitResponse,
} from "../fixtures/http"
import {
  boardConfigurationResponse,
  boardListResponse,
  boardResponse,
  issueDetailResponse,
  issueSearchResponse,
  sprintListResponse,
} from "../fixtures/board"

const origin = parseJiraCloudSite("acme")!

function auth(fetch: ReturnType<typeof fetchScript>) {
  return { origin, email: EMAIL_FIXTURE, token: TOKEN_FIXTURE, fetch }
}

function boardCloudFetch() {
  return fetchScript((url, init) => {
    if (url.pathname === "/rest/agile/1.0/board") {
      return url.searchParams.get("startAt") === "2" ? boardListResponse(2) : boardListResponse(1)
    }
    if (url.pathname === "/rest/agile/1.0/board/84/configuration") return boardConfigurationResponse()
    if (url.pathname === "/rest/agile/1.0/board/84/sprint") return sprintListResponse()
    if (url.pathname === "/rest/agile/1.0/board/84") return boardResponse()
    if (url.pathname === "/rest/api/3/search/jql") {
      const body = init?.body ? JSON.parse(String(init.body)) : {}
      return issueSearchResponse(body.nextPageToken === "page-2" ? 2 : 1)
    }
    if (url.pathname === "/rest/api/3/issue/PLAT-1") return issueDetailResponse()
    return jsonResponse(404, { errorMessages: ["missing"] })
  })
}

describe("Jira board client", () => {
  test("paginates Agile boards and keeps only Scrum and Kanban", async () => {
    const requested: string[] = []
    const fetch = fetchScript((url, init) => {
      requested.push(`${init?.method ?? "GET"} ${url.pathname}?startAt=${url.searchParams.get("startAt") ?? ""}`)
      return boardCloudFetch()(url, init)
    })
    const result = await fetchJiraBoards(auth(fetch))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected boards")
    expect(result.boards.map((board) => board.id)).toEqual([84, 92, 101])
    expect(requested).toEqual(["GET /rest/agile/1.0/board?startAt=0", "GET /rest/agile/1.0/board?startAt=2"])
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("loads board configuration, columns, and selectable sprints", async () => {
    const result = await fetchJiraBoard(auth(boardCloudFetch()), 84)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected board")
    expect(result.board.filterId).toBe("1001")
    expect(result.board.columns.map((column) => column.name)).toEqual(["To Do", "In progress", "Done"])
    expect(result.board.sprints.map((sprint) => sprint.id)).toEqual([37, 72])
    expect(result.board.activeSprint?.id).toBe(37)
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("paginates issues through /search/jql nextPageToken and never the removed /search", async () => {
    const requested: string[] = []
    const bodies: unknown[] = []
    const fetch = fetchScript((url, init) => {
      requested.push(`${init?.method ?? "GET"} ${url.pathname}`)
      if (init?.body) bodies.push(JSON.parse(String(init.body)))
      return boardCloudFetch()(url, init)
    })
    const result = await fetchJiraBoardIssues(auth(fetch), { boardId: 84, sprintId: 37 })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected issues")
    expect(result.issues.map((issue) => issue.key)).toEqual(["PLAT-1", "PLAT-2"])
    expect(requested).toEqual(["GET /rest/agile/1.0/board/84/configuration", "POST /rest/api/3/search/jql", "POST /rest/api/3/search/jql"])
    expect(requested.every((entry) => !entry.includes("/rest/api/3/search?"))).toBe(true)
    expect(bodies[0]).toEqual({
      jql: "filter = 1001 AND sprint = 37",
      maxResults: 100,
      fields: ["summary", "status", "assignee", "issuetype", "priority", "labels", "created", "updated"],
    })
    expect(bodies[1]).toMatchObject({ nextPageToken: "page-2" })
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })

  test("loads issue detail as plain text", async () => {
    const result = await fetchJiraIssue(auth(boardCloudFetch()), "PLAT-1")
    expect(result).toEqual({
      ok: true,
      issue: {
        id: "10001",
        key: "PLAT-1",
        summary: "Render the Jira board",
        description: "Show the board columns.",
        statusName: "To Do",
        assigneeName: "Mia Krystof",
        reporterName: "Ada Lovelace",
        issueTypeName: "Story",
        priorityName: "Medium",
        labels: ["board"],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
        url: "https://acme.atlassian.net/browse/PLAT-1",
      },
    })
  })

  test("normalizes a rate-limited board request without leaking the token", async () => {
    const result = await fetchJiraBoards(
      auth(
        fetchScript(() => rateLimitResponse(5)),
      ),
    )
    expect(result).toEqual({ ok: false, category: "rate-limit", retryAfterSeconds: 5 })
    expect(containsSecret(JSON.stringify(result), [TOKEN_FIXTURE])).toBe(false)
  })
})
