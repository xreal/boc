import { Option, Schema } from "effect"
import {
  activeSprintFrom,
  boardIssuesJql,
  columnsFromConfiguration,
  configurationBoardId,
  configurationBoardType,
  configurationFilterId,
  configurationName,
  configurationSubQuery,
  isJiraIssueKey,
  mapJiraBoardIssue,
  mapJiraBoardSummary,
  mapJiraIssueDetail,
  mapJiraSprint,
  selectableSprints,
  storyPointFieldIds,
  type JiraBoardIssue,
  type JiraBoardSummary,
  type JiraBoardView,
  type JiraIssueDetail,
  type JiraSprintSummary,
} from "../domain/board"
import { failJira, type JiraClientFailure } from "../domain/errors"
import type { JiraCloudOrigin } from "../domain/site"
import { decodeUnknownJson, jiraRequest, type JiraFetch, type JiraWait } from "./client"

const BOARD_PAGE_SIZE = 50
const MAX_BOARD_PAGES = 40
const SPRINT_PAGE_SIZE = 50
const MAX_SPRINT_PAGES = 40
const ISSUE_PAGE_SIZE = 100
const MAX_ISSUE_PAGES = 50
const ISSUE_FIELDS = ["summary", "status", "assignee", "issuetype", "priority", "labels", "created", "updated"]
const ISSUE_DETAIL_FIELDS = [...ISSUE_FIELDS, "description", "reporter"]

const AgilePage = Schema.Struct({
  isLast: Schema.optionalKey(Schema.Boolean),
  startAt: Schema.optionalKey(Schema.Number),
  maxResults: Schema.optionalKey(Schema.Number),
  values: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})

const SearchPage = Schema.Struct({
  isLast: Schema.optionalKey(Schema.Boolean),
  nextPageToken: Schema.optionalKey(Schema.String),
  issues: Schema.optionalKey(Schema.Array(Schema.Unknown)),
})

const decodeAgilePage = Schema.decodeUnknownOption(Schema.fromJsonString(AgilePage))
const decodeSearchPage = Schema.decodeUnknownOption(Schema.fromJsonString(SearchPage))

export type JiraAuth = {
  origin: JiraCloudOrigin
  email: string
  token: string
  fetch: JiraFetch
  signal?: AbortSignal
  wait?: JiraWait
}

export async function fetchJiraBoards(auth: JiraAuth): Promise<{ ok: true; boards: JiraBoardSummary[] } | JiraClientFailure> {
  const boards: JiraBoardSummary[] = []
  let startAt = 0

  for (let page = 0; page < MAX_BOARD_PAGES; page++) {
    const result = await jiraRequest({
      ...auth,
      path: "/rest/agile/1.0/board",
      query: { startAt, maxResults: BOARD_PAGE_SIZE, orderBy: "name" },
      retry: "safe-read",
    })
    if (!result.ok) return result
    const decoded = Option.getOrUndefined(decodeAgilePage(result.text))
    if (!decoded) return failJira("malformed")

    const values = decoded.values ?? []
    for (const raw of values) {
      const board = mapJiraBoardSummary(raw)
      if (board) boards.push(board)
    }

    const nextStartAt = (decoded.startAt ?? startAt) + values.length
    if (decoded.isLast === true || values.length === 0 || nextStartAt <= startAt) break
    startAt = nextStartAt
  }

  return { ok: true, boards }
}

export async function fetchJiraBoard(auth: JiraAuth, boardId: number): Promise<{ ok: true; board: JiraBoardView } | JiraClientFailure> {
  if (!Number.isSafeInteger(boardId) || boardId <= 0) return failJira("malformed")

  const [boardResult, configurationResult, sprintResult] = await Promise.all([
    jiraRequest({ ...auth, path: `/rest/agile/1.0/board/${boardId}`, retry: "safe-read" }),
    jiraRequest({ ...auth, path: `/rest/agile/1.0/board/${boardId}/configuration`, retry: "safe-read" }),
    fetchJiraSprints(auth, boardId),
  ])
  if (!boardResult.ok) return boardResult
  if (!configurationResult.ok) return configurationResult

  const summary = mapJiraBoardSummary(decodeUnknown(boardResult.text))
  const configuration = decodeUnknown(configurationResult.text)
  const id = configurationBoardId(configuration) ?? summary?.id ?? boardId
  const name = configurationName(configuration) ?? summary?.name
  const type = summary?.type ?? configurationBoardType(configuration)
  const filterId = configurationFilterId(configuration)
  if (!name || !type || !filterId) return failJira("malformed")

  const sprints = sprintResult.ok
    ? sprintResult.sprints
    : sprintFailureAsEmpty(type, sprintResult)
  if (!Array.isArray(sprints)) return sprints

  const activeSprint = activeSprintFrom(sprints)
  const subQuery = configurationSubQuery(configuration)
  return {
    ok: true,
    board: {
      id,
      name,
      type,
      filterId,
      columns: columnsFromConfiguration(configuration, id),
      sprints: selectableSprints(sprints),
      ...(subQuery ? { subQuery } : {}),
      ...(activeSprint ? { activeSprint } : {}),
    },
  }
}

export async function fetchJiraSprints(
  auth: JiraAuth,
  boardId: number,
): Promise<{ ok: true; sprints: JiraSprintSummary[] } | JiraClientFailure> {
  const sprints: JiraSprintSummary[] = []
  let startAt = 0

  for (let page = 0; page < MAX_SPRINT_PAGES; page++) {
    const result = await jiraRequest({
      ...auth,
      path: `/rest/agile/1.0/board/${boardId}/sprint`,
      query: { startAt, maxResults: SPRINT_PAGE_SIZE, state: "active,future" },
      retry: "safe-read",
    })
    if (!result.ok) return result
    const decoded = Option.getOrUndefined(decodeAgilePage(result.text))
    if (!decoded) return failJira("malformed")

    const values = decoded.values ?? []
    for (const raw of values) {
      const sprint = mapJiraSprint(raw)
      if (sprint) sprints.push(sprint)
    }

    const nextStartAt = (decoded.startAt ?? startAt) + values.length
    if (decoded.isLast === true || values.length === 0 || nextStartAt <= startAt) break
    startAt = nextStartAt
  }

  return { ok: true, sprints }
}

export async function fetchJiraBoardIssues(
  auth: JiraAuth,
  input: { boardId: number; sprintId?: number },
): Promise<{ ok: true; issues: JiraBoardIssue[] } | JiraClientFailure> {
  if (!Number.isSafeInteger(input.boardId) || input.boardId <= 0) return failJira("malformed")
  if (input.sprintId !== undefined && (!Number.isSafeInteger(input.sprintId) || input.sprintId <= 0)) {
    return failJira("malformed")
  }

  const configurationResult = await jiraRequest({
    ...auth,
    path: `/rest/agile/1.0/board/${input.boardId}/configuration`,
    retry: "safe-read",
  })
  if (!configurationResult.ok) return configurationResult
  const configuration = decodeUnknown(configurationResult.text)
  const filterId = configurationFilterId(configuration)
  if (!filterId) return failJira("malformed")

  return fetchJiraIssuesByJql(
    auth,
    boardIssuesJql({
      filterId,
      sprintId: input.sprintId,
      subQuery: configurationSubQuery(configuration),
    }),
  )
}

export async function fetchJiraIssuesByJql(
  auth: JiraAuth,
  jql: string,
): Promise<{ ok: true; issues: JiraBoardIssue[] } | JiraClientFailure> {
  const storyPointFields = await fetchStoryPointFieldIds(auth)
  const issues: JiraBoardIssue[] = []
  let nextPageToken: string | undefined

  for (let page = 0; page < MAX_ISSUE_PAGES; page++) {
    const result = await jiraRequest({
      ...auth,
      method: "POST",
      path: "/rest/api/3/search/jql",
      body: {
        jql,
        maxResults: ISSUE_PAGE_SIZE,
        fields: [...ISSUE_FIELDS, ...storyPointFields],
        ...(nextPageToken ? { nextPageToken } : {}),
      },
      retry: "safe-read",
    })
    if (!result.ok) return result
    const decoded = Option.getOrUndefined(decodeSearchPage(result.text))
    if (!decoded) return failJira("malformed")

    const rawIssues = decoded.issues ?? []
    for (const raw of rawIssues) {
      const issue = mapJiraBoardIssue(raw, auth.origin.origin, storyPointFields)
      if (issue) issues.push(issue)
    }

    if (decoded.isLast === true || !decoded.nextPageToken) break
    nextPageToken = decoded.nextPageToken
  }

  return { ok: true, issues }
}

export async function fetchJiraIssue(
  auth: JiraAuth,
  issueKey: string,
): Promise<{ ok: true; issue: JiraIssueDetail } | JiraClientFailure> {
  const key = issueKey.trim()
  if (!isJiraIssueKey(key)) return failJira("malformed")

  const result = await jiraRequest({
    ...auth,
    path: `/rest/api/3/issue/${encodeURIComponent(key)}`,
    query: { fields: ISSUE_DETAIL_FIELDS.join(",") },
    retry: "safe-read",
  })
  if (!result.ok) return result

  const issue = mapJiraIssueDetail(decodeUnknown(result.text), auth.origin.origin)
  if (!issue) return failJira("malformed")
  return { ok: true, issue }
}

function sprintFailureAsEmpty(type: "scrum" | "kanban", failure: JiraClientFailure) {
  if (type === "scrum") return failure
  if (failure.category === "auth" || failure.category === "rate-limit" || failure.category === "network") return failure
  return []
}

async function fetchStoryPointFieldIds(auth: JiraAuth) {
  const result = await jiraRequest({
    ...auth,
    path: "/rest/api/3/field",
    retry: "safe-read",
  })
  if (!result.ok) return []
  return storyPointFieldIds(Option.getOrUndefined(decodeUnknownJson(result.text)))
}

function decodeUnknown(text: string): unknown {
  return Option.getOrUndefined(decodeUnknownJson(text))
}
