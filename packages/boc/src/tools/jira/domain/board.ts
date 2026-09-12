import { Schema } from "effect"

export { adfToMarkdown, adfToPlainText, safeHttpUrl } from "./adf"

export const MAX_SAVED_JIRA_BOARDS = 10
export const JIRA_UNASSIGNED = "__boc_unassigned__"
export const JIRA_BOARD_LANES = ["stories", "critical", "support"] as const
export type JiraBoardLane = (typeof JIRA_BOARD_LANES)[number]

export const JiraBoardType = Schema.Literals(["scrum", "kanban"])
export type JiraBoardType = typeof JiraBoardType.Type

export const JiraBoardSummary = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  type: JiraBoardType,
  projectKey: Schema.optionalKey(Schema.String),
  projectName: Schema.optionalKey(Schema.String),
})
export type JiraBoardSummary = typeof JiraBoardSummary.Type

export const JiraBoardColumn = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  statusIds: Schema.Array(Schema.String),
})
export type JiraBoardColumn = typeof JiraBoardColumn.Type

export const JiraSprintSummary = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  state: Schema.String,
  startDate: Schema.optionalKey(Schema.String),
  endDate: Schema.optionalKey(Schema.String),
  completeDate: Schema.optionalKey(Schema.String),
  goal: Schema.optionalKey(Schema.String),
})
export type JiraSprintSummary = typeof JiraSprintSummary.Type

export const JiraBoardIssue = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  summary: Schema.String,
  statusId: Schema.optionalKey(Schema.String),
  statusName: Schema.optionalKey(Schema.String),
  assigneeName: Schema.optionalKey(Schema.String),
  issueTypeName: Schema.optionalKey(Schema.String),
  issueTypeIconUrl: Schema.optionalKey(Schema.String),
  subtask: Schema.optionalKey(Schema.Boolean),
  priorityName: Schema.optionalKey(Schema.String),
  storyPoints: Schema.optionalKey(Schema.Number),
  assigneeAvatarUrl: Schema.optionalKey(Schema.String),
  labels: Schema.Array(Schema.String),
  createdAt: Schema.optionalKey(Schema.String),
  updatedAt: Schema.optionalKey(Schema.String),
  url: Schema.String,
})
export type JiraBoardIssue = typeof JiraBoardIssue.Type

export const JiraBoardView = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  type: JiraBoardType,
  filterId: Schema.String,
  subQuery: Schema.optionalKey(Schema.String),
  columns: Schema.Array(JiraBoardColumn),
  sprints: Schema.Array(JiraSprintSummary),
  activeSprint: Schema.optionalKey(JiraSprintSummary),
})
export type JiraBoardView = typeof JiraBoardView.Type

export const JiraPreferences = Schema.Struct({
  savedBoards: Schema.Array(JiraBoardSummary),
  defaultBoardId: Schema.optionalKey(Schema.Number),
  projectTargets: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        boardId: Schema.Number,
        server: Schema.String,
        directory: Schema.String,
      }),
    ),
  ),
})
export type JiraPreferences = typeof JiraPreferences.Type
export type JiraProjectTarget = NonNullable<JiraPreferences["projectTargets"]>[number]

export type JiraIssueFilters = {
  search?: string
  assignee?: string
  issueType?: string
  priority?: string
}

export type JiraColumnGroup = {
  column: JiraBoardColumn
  issues: JiraBoardIssue[]
}

export type JiraBoardLaneSummary = {
  value: JiraBoardLane
  count: number
  newCount: number
}

export function mapJiraBoardSummary(raw: unknown): JiraBoardSummary | undefined {
  if (!isRecord(raw)) return
  const id = positiveInteger(raw.id)
  const name = text(raw.name)
  const type = raw.type === "scrum" || raw.type === "kanban" ? raw.type : undefined
  if (id === undefined || !name || !type) return
  const location = isRecord(raw.location) ? raw.location : undefined
  const projectKey = text(location?.projectKey)
  const projectName = text(location?.projectName) ?? text(location?.name)
  return {
    id,
    name,
    type,
    ...(projectKey ? { projectKey } : {}),
    ...(projectName ? { projectName } : {}),
  }
}

export function columnsFromConfiguration(raw: unknown, boardId: number): JiraBoardColumn[] {
  if (!isRecord(raw)) return []
  const columnConfig = isRecord(raw.columnConfig) ? raw.columnConfig : undefined
  const rawColumns = columnConfig && Array.isArray(columnConfig.columns) ? columnConfig.columns : []
  return rawColumns.flatMap((rawColumn, index) => {
    if (!isRecord(rawColumn)) return []
    const name = text(rawColumn.name)
    if (!name) return []
    const statuses = Array.isArray(rawColumn.statuses) ? rawColumn.statuses : []
    return [
      {
        id: `${boardId}:${index}`,
        name,
        statusIds: statuses.flatMap((status) => {
          if (!isRecord(status)) return []
          const statusId = text(status.id)
          return statusId ? [statusId] : []
        }),
      },
    ]
  })
}

export function configurationFilterId(raw: unknown) {
  if (!isRecord(raw)) return
  const filter = isRecord(raw.filter) ? raw.filter : undefined
  const id = filter ? text(String(filter.id ?? "")) ?? numericId(filter.id) : undefined
  if (!id || !/^\d+$/.test(id)) return
  return id
}

export function configurationSubQuery(raw: unknown) {
  if (!isRecord(raw)) return
  return text(raw.subQuery)
}

export function configurationName(raw: unknown) {
  if (!isRecord(raw)) return
  return text(raw.name)
}

export function configurationBoardId(raw: unknown) {
  if (!isRecord(raw)) return
  return positiveInteger(raw.id)
}

export function configurationBoardType(raw: unknown): JiraBoardType | undefined {
  if (!isRecord(raw)) return
  if (raw.type === "scrum" || raw.type === "kanban") return raw.type
}

export function mapJiraSprint(raw: unknown): JiraSprintSummary | undefined {
  if (!isRecord(raw)) return
  const id = positiveInteger(raw.id)
  const name = text(raw.name)
  const state = text(raw.state)
  if (id === undefined || !name || !state) return
  return compact({
    id,
    name,
    state: state.toLowerCase(),
    startDate: text(raw.startDate),
    endDate: text(raw.endDate),
    completeDate: text(raw.completeDate),
    goal: text(raw.goal),
  })
}

export function mapJiraBoardIssue(
  raw: unknown,
  browseOrigin: string,
  storyPointFields: readonly string[] = [],
): JiraBoardIssue | undefined {
  if (!isRecord(raw)) return
  const id = text(raw.id) ?? numericId(raw.id)
  const key = text(raw.key)
  const fields = isRecord(raw.fields) ? raw.fields : undefined
  const summary = fields ? text(fields.summary) : undefined
  if (!id || !key || !summary) return
  const status = fields && isRecord(fields.status) ? fields.status : undefined
  const assignee = fields && isRecord(fields.assignee) ? fields.assignee : undefined
  const issueType = fields && isRecord(fields.issuetype) ? fields.issuetype : undefined
  const priority = fields && isRecord(fields.priority) ? fields.priority : undefined
  return compact({
    id,
    key,
    summary,
    statusId: status ? text(status.id) : undefined,
    statusName: status ? text(status.name) : undefined,
    assigneeName: assignee ? text(assignee.displayName) : undefined,
    assigneeAvatarUrl: assigneeAvatarUrl(assignee, browseOrigin),
    issueTypeName: issueType ? text(issueType.name) : undefined,
    issueTypeIconUrl: issueType ? jiraAssetUrl(issueType.iconUrl, browseOrigin) : undefined,
    subtask: isSubtaskIssueType(issueType) ? true : undefined,
    priorityName: priority ? text(priority.name) : undefined,
    storyPoints: fields ? storyPointsFrom(fields, storyPointFields) : undefined,
    labels: stringList(fields?.labels),
    createdAt: fields ? text(fields.created) : undefined,
    updatedAt: fields ? text(fields.updated) : undefined,
    url: issueBrowseUrl(browseOrigin, key),
  })
}

export function issueBrowseUrl(browseOrigin: string, key: string) {
  return `${browseOrigin.replace(/\/+$/, "")}/browse/${encodeURIComponent(key)}`
}

export function boardIssuesJql(input: { filterId: string; sprintId?: number; subQuery?: string }) {
  const parts = [`filter = ${input.filterId}`]
  if (input.sprintId !== undefined) return `${parts[0]} AND sprint = ${input.sprintId}`
  const subQuery = input.subQuery?.trim()
  if (subQuery) parts.push(`(${subQuery})`)
  return parts.join(" AND ")
}

export function groupIssuesByColumn(columns: readonly JiraBoardColumn[], issues: readonly JiraBoardIssue[]): JiraColumnGroup[] {
  const statusToColumn = new Map(columns.flatMap((column) => column.statusIds.map((statusId) => [statusId, column.id])))
  const issuesByColumn = new Map(columns.map((column) => [column.id, [] as JiraBoardIssue[]]))
  const unmapped: JiraBoardIssue[] = []

  for (const issue of issues) {
    const columnId = issue.statusId ? statusToColumn.get(issue.statusId) : undefined
    const columnIssues = columnId ? issuesByColumn.get(columnId) : undefined
    if (columnIssues) {
      columnIssues.push(issue)
      continue
    }
    unmapped.push(issue)
  }

  const grouped = columns.map((column) => ({
    column,
    issues: issuesByColumn.get(column.id) ?? [],
  }))
  if (unmapped.length === 0) return grouped
  grouped.push({
    column: { id: "unmapped", name: "Other", statusIds: [] },
    issues: unmapped,
  })
  return grouped
}

export function filterIssues(issues: readonly JiraBoardIssue[], filters: JiraIssueFilters) {
  const search = filters.search?.trim().toLocaleLowerCase()
  return issues.filter((issue) => {
    if (
      search &&
      !issue.key.toLocaleLowerCase().includes(search) &&
      !issue.summary.toLocaleLowerCase().includes(search)
    ) {
      return false
    }
    if (filters.assignee === JIRA_UNASSIGNED && issue.assigneeName) return false
    if (filters.assignee && filters.assignee !== JIRA_UNASSIGNED && issue.assigneeName !== filters.assignee) {
      return false
    }
    if (filters.issueType && issue.issueTypeName !== filters.issueType) return false
    if (filters.priority && issue.priorityName !== filters.priority) return false
    return true
  })
}

export function isJiraBoardLane(value: string): value is JiraBoardLane {
  return JIRA_BOARD_LANES.some((lane) => lane === value)
}

/** Split the board into label-driven lanes. Critical wins on overlap. */
export function jiraIssueLane(issue: Pick<JiraBoardIssue, "labels">): JiraBoardLane {
  const labels = new Set(issue.labels.map((label) => label.toLocaleLowerCase()))
  if (labels.has("critical")) return "critical"
  if (labels.has("pc_fastlane")) return "support"
  return "stories"
}

export function filterIssuesByLane(issues: readonly JiraBoardIssue[], lane: JiraBoardLane) {
  return issues.filter((issue) => jiraIssueLane(issue) === lane)
}

export function countNewLaneIssues(issues: readonly JiraBoardIssue[], lane: JiraBoardLane, since: number) {
  return filterIssuesByLane(issues, lane).filter((issue) => {
    if (!issue.createdAt) return false
    const createdAt = Date.parse(issue.createdAt)
    return !Number.isNaN(createdAt) && createdAt > since
  }).length
}

export function parseLaneLastViewed(raw: unknown): Partial<Record<JiraBoardLane, number>> {
  if (!raw || typeof raw !== "object") return {}
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([lane, value]) => isJiraBoardLane(lane) && typeof value === "number" && Number.isFinite(value),
    ),
  )
}

export function summarizeBoardLanes(
  issues: readonly JiraBoardIssue[],
  lastViewed: Partial<Record<JiraBoardLane, number>>,
  firstOpenCutoff: number,
): JiraBoardLaneSummary[] {
  return JIRA_BOARD_LANES.map((lane) => ({
    value: lane,
    count: filterIssuesByLane(issues, lane).length,
    newCount: countNewLaneIssues(issues, lane, lastViewed[lane] ?? firstOpenCutoff),
  }))
}

export function uniqueIssueNames(
  issues: readonly JiraBoardIssue[],
  field: "assigneeName" | "issueTypeName" | "priorityName",
) {
  return [...new Set(issues.flatMap((issue) => (issue[field] ? [issue[field]] : [])))].sort((left, right) =>
    left.localeCompare(right),
  )
}

export function sortSprints(sprints: readonly JiraSprintSummary[]) {
  return [...sprints].sort((left, right) => {
    const state = sprintStateOrder(left.state) - sprintStateOrder(right.state)
    if (state !== 0) return state
    if (left.state === "closed" && right.state === "closed") {
      return sprintTimestamp(right) - sprintTimestamp(left) || right.id - left.id
    }
    return sprintTimestamp(left) - sprintTimestamp(right) || left.id - right.id
  })
}

export function resolveSprintId(
  requestedSprintId: number | undefined,
  sprints: readonly JiraSprintSummary[],
  activeSprint?: JiraSprintSummary,
) {
  if (requestedSprintId !== undefined && sprints.some((sprint) => sprint.id === requestedSprintId)) {
    return requestedSprintId
  }
  return (
    activeSprint?.id ??
    sprints.find((sprint) => sprint.state === "active")?.id ??
    sprints.find((sprint) => sprint.state === "future")?.id
  )
}

export function activeSprintFrom(sprints: readonly JiraSprintSummary[]) {
  return sortSprints(sprints).find((sprint) => sprint.state === "active")
}

export function selectableSprints(sprints: readonly JiraSprintSummary[]) {
  return sortSprints(sprints.filter((sprint) => sprint.state === "active" || sprint.state === "future"))
}

export function normalizeSavedBoards(
  boards: readonly JiraBoardSummary[],
  defaultBoardId?: number,
  projectTargets: readonly JiraProjectTarget[] = [],
): JiraPreferences {
  const savedBoards: JiraBoardSummary[] = []
  const seen = new Set<number>()
  for (const board of boards) {
    if (seen.has(board.id)) continue
    seen.add(board.id)
    savedBoards.push(board)
    if (savedBoards.length === MAX_SAVED_JIRA_BOARDS) break
  }
  const saved = new Set(savedBoards.map((board) => board.id))
  const targets = projectTargets.filter(
    (target, index) =>
      saved.has(target.boardId) &&
      target.directory.length > 0 &&
      projectTargets.findIndex((item) => item.boardId === target.boardId) === index,
  )
  return {
    savedBoards,
    ...(defaultBoardId !== undefined && saved.has(defaultBoardId) ? { defaultBoardId } : {}),
    ...(targets.length > 0 ? { projectTargets: targets } : {}),
  }
}

export function resolveSelectedBoardId(
  requested: number | undefined,
  preferences: JiraPreferences,
  available: readonly JiraBoardSummary[],
) {
  const pool = available.length > 0 ? available : preferences.savedBoards
  if (requested !== undefined && pool.some((board) => board.id === requested)) return requested
  if (preferences.defaultBoardId !== undefined && pool.some((board) => board.id === preferences.defaultBoardId)) {
    return preferences.defaultBoardId
  }
  const saved = preferences.savedBoards.find((board) => pool.some((candidate) => candidate.id === board.id))
  return saved?.id ?? pool[0]?.id
}

export function resolveSetupBoardId(
  requested: number | undefined,
  preferences: JiraPreferences,
  available: readonly JiraBoardSummary[],
) {
  if (requested === undefined && preferences.defaultBoardId === undefined) return
  return resolveSelectedBoardId(requested, preferences, available)
}

export function isJiraIssueKey(value: string) {
  return /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(value.trim())
}

function sprintStateOrder(state: string) {
  if (state === "active") return 0
  if (state === "future") return 1
  if (state === "closed") return 2
  return 3
}

function sprintTimestamp(sprint: JiraSprintSummary) {
  const value = sprint.completeDate ?? sprint.endDate ?? sprint.startDate
  const timestamp = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(timestamp) ? sprint.id : timestamp
}

export function storyPointFieldIds(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.flatMap((field) => {
    if (!isRecord(field) || !isStoryPointField(field)) return []
    const id = text(field.id) ?? text(field.key)
    return id ? [id] : []
  }))]
}

export function jiraAssetUrl(value: unknown, origin: string) {
  const raw = text(value)
  if (!raw) return
  const absolute = raw.startsWith("/") ? `${origin.replace(/\/+$/, "")}${raw}` : raw
  if (!URL.canParse(absolute)) return
  const url = new URL(absolute)
  if (url.protocol !== "https:") return
  if (url.username !== "" || url.password !== "") return
  const host = url.hostname.toLowerCase()
  if (host.endsWith(".atlassian.net") || host.endsWith(".atl-paas.net") || host === "id.atlassian.com") {
    return url.toString()
  }
}

export function jiraIssueIsSubtask(issue: Pick<JiraBoardIssue, "subtask" | "issueTypeName">) {
  return issue.subtask === true || isSubtaskTypeName(issue.issueTypeName)
}

function assigneeAvatarUrl(assignee: Record<string, unknown> | undefined, origin: string) {
  if (!assignee) return
  const urls = isRecord(assignee.avatarUrls) ? assignee.avatarUrls : undefined
  if (!urls) return
  return jiraAssetUrl(urls["24x24"] ?? urls["48x48"] ?? urls["32x32"] ?? urls["16x16"], origin)
}

function storyPointsFrom(fields: Record<string, unknown>, fieldIds: readonly string[]) {
  for (const id of fieldIds) {
    const points = finiteNumber(fields[id])
    if (points !== undefined) return points
  }
}

function isStoryPointField(field: Record<string, unknown>) {
  const schema = isRecord(field.schema) ? field.schema : undefined
  const custom = text(schema?.custom)?.toLowerCase() ?? ""
  if (custom.includes("story-points") || custom.includes("storypoint")) return true
  const key = text(field.key)?.toLowerCase() ?? ""
  if (key === "storypointestimate") return true
  const name = (text(field.name) ?? text(field.untranslatedName) ?? "").toLowerCase()
  return name === "story points" || name === "story point estimate"
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
}

function isSubtaskIssueType(issueType: Record<string, unknown> | undefined) {
  if (!issueType) return false
  if (issueType.subtask === true) return true
  return isSubtaskTypeName(text(issueType.name))
}

function isSubtaskTypeName(name: string | undefined) {
  if (!name) return false
  return name.toLowerCase().replace(/[\s_-]+/g, "") === "subtask"
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((entry) => (text(entry) ? [text(entry)!] : [])))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value !== "string") return
  const trimmed = value.trim()
  if (!trimmed) return
  return trimmed
}

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
}

function numericId(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim()
}
