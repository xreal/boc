import { Option, Schema } from "effect"
import { adfToMarkdown } from "./adf"
import { jiraAssetUrl, mapJiraBoardIssue } from "./board"
import { JIRA_ERROR_CATEGORIES } from "./errors"

export const JIRA_COMMENT_LIMIT = 10_000
export const JIRA_COMMENT_PAGE_SIZE = 20
export const JIRA_ISSUE_STATUS_CACHE_MS = 60_000
export const JIRA_ISSUE_STATUS_BATCH_SIZE = 100
export const JiraIssueKey = Schema.String.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*-\d+$/),
)
export const JiraPageOffset = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))
export const JiraAccountId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(255),
  Schema.isPattern(/^(?!-1$)\S+$/),
)
export const JiraCommentText = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(JIRA_COMMENT_LIMIT),
  Schema.isPattern(/\S/),
)

export const JiraIssueStatus = Schema.Struct({
  key: JiraIssueKey,
  statusName: Schema.NonEmptyString,
})
export type JiraIssueStatus = typeof JiraIssueStatus.Type

export const JiraIssueUser = Schema.Struct({
  accountId: JiraAccountId,
  displayName: Schema.NonEmptyString,
  avatarUrl: Schema.optionalKey(Schema.String),
  emailAddress: Schema.optionalKey(Schema.String),
})
export type JiraIssueUser = typeof JiraIssueUser.Type

export const JiraIssueDetail = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  summary: Schema.String,
  description: Schema.optionalKey(Schema.String),
  statusName: Schema.optionalKey(Schema.String),
  assignee: Schema.NullOr(JiraIssueUser),
  reporterName: Schema.optionalKey(Schema.String),
  issueTypeName: Schema.optionalKey(Schema.String),
  priorityName: Schema.optionalKey(Schema.String),
  labels: Schema.Array(Schema.String),
  createdAt: Schema.optionalKey(Schema.String),
  updatedAt: Schema.optionalKey(Schema.String),
  url: Schema.String,
})
export type JiraIssueDetail = typeof JiraIssueDetail.Type

export const JiraComment = Schema.Struct({
  id: Schema.NonEmptyString,
  author: Schema.optionalKey(JiraIssueUser),
  body: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
})
export type JiraComment = typeof JiraComment.Type

export const JiraCommentPage = Schema.Struct({
  comments: Schema.Array(JiraComment),
  startAt: JiraPageOffset,
  maxResults: JiraPageOffset,
  total: JiraPageOffset,
  nextStartAt: Schema.NullOr(JiraPageOffset),
})
export type JiraCommentPage = typeof JiraCommentPage.Type

export const JiraMutationFailure = Schema.Struct({
  ok: Schema.Literal(false),
  category: Schema.Literals(JIRA_ERROR_CATEGORIES),
  outcome: Schema.Literals(["rejected", "unknown"]),
})
export type JiraMutationFailure = typeof JiraMutationFailure.Type

const RawUser = Schema.Struct({
  accountId: JiraAccountId,
  displayName: Schema.NonEmptyString,
  emailAddress: Schema.optionalKey(Schema.String),
  avatarUrls: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})
const RawComment = Schema.Struct({
  id: Schema.NonEmptyString,
  author: Schema.optionalKey(Schema.Unknown),
  body: Schema.Unknown,
  created: Schema.String,
  updated: Schema.String,
})
const RawPage = Schema.Struct({
  comments: Schema.Array(Schema.Unknown),
  startAt: JiraPageOffset,
  maxResults: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  total: JiraPageOffset,
})
const RawIssueStatus = Schema.Struct({
  key: JiraIssueKey,
  fields: Schema.Struct({
    status: Schema.optionalKey(Schema.NullOr(Schema.Struct({ name: Schema.NonEmptyString }))),
  }),
})

export function mapJiraUser(raw: unknown, origin: string): JiraIssueUser | undefined {
  const user = Option.getOrUndefined(Schema.decodeUnknownOption(RawUser)(raw))
  if (!user) return
  const avatarUrl = jiraAssetUrl(user.avatarUrls?.["48x48"] ?? user.avatarUrls?.["24x24"], origin)
  return {
    accountId: user.accountId,
    displayName: user.displayName,
    ...(avatarUrl ? { avatarUrl } : {}),
    ...(user.emailAddress ? { emailAddress: user.emailAddress } : {}),
  }
}

export function mapJiraIssueDetail(raw: unknown, origin: string): JiraIssueDetail | undefined {
  const issue = mapJiraBoardIssue(raw, origin)
  const detail = Option.getOrUndefined(
    Schema.decodeUnknownOption(
      Schema.Struct({
        fields: Schema.Struct({
          description: Schema.optionalKey(Schema.Unknown),
          assignee: Schema.Unknown,
          reporter: Schema.optionalKey(Schema.Unknown),
        }),
      }),
    )(raw),
  )
  if (!issue || !detail) return
  const assignee = detail.fields.assignee === null ? null : mapJiraUser(detail.fields.assignee, origin)
  if (assignee === undefined) return
  return {
    id: issue.id,
    key: issue.key,
    summary: issue.summary,
    labels: issue.labels,
    url: issue.url,
    assignee,
    description: adfToMarkdown(detail.fields.description),
    reporterName: mapJiraUser(detail.fields.reporter, origin)?.displayName,
    statusName: issue.statusName,
    issueTypeName: issue.issueTypeName,
    priorityName: issue.priorityName,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }
}

export function mapJiraIssueStatus(raw: unknown): JiraIssueStatus | undefined {
  const issue = Option.getOrUndefined(Schema.decodeUnknownOption(RawIssueStatus)(raw))
  const statusName = issue?.fields.status?.name
  if (!issue || !statusName) return
  return { key: issue.key, statusName }
}

export function mapJiraComment(raw: unknown, origin: string): JiraComment | undefined {
  const comment = Option.getOrUndefined(Schema.decodeUnknownOption(RawComment)(raw))
  if (!comment || !Number.isFinite(Date.parse(comment.created)) || !Number.isFinite(Date.parse(comment.updated))) return
  const body = adfToMarkdown(comment.body)
  if (!body) return
  const author = mapJiraUser(comment.author, origin)
  return { id: comment.id, body, createdAt: comment.created, updatedAt: comment.updated, ...(author ? { author } : {}) }
}

export function mapJiraCommentPage(raw: unknown, origin: string): JiraCommentPage | undefined {
  const page = Option.getOrUndefined(Schema.decodeUnknownOption(RawPage)(raw))
  if (!page || page.comments.length > page.maxResults) return
  const next = page.startAt + page.comments.length
  if (next < page.total && page.comments.length === 0) return
  return {
    comments: mergeJiraComments(
      [],
      page.comments.flatMap((raw) => {
        const comment = mapJiraComment(raw, origin)
        return comment ? [comment] : []
      }),
    ),
    startAt: page.startAt,
    maxResults: page.maxResults,
    total: page.total,
    nextStartAt: next < page.total ? next : null,
  }
}

export function mergeJiraComments(previous: readonly JiraComment[], incoming: readonly JiraComment[]) {
  return [...new Map([...previous, ...incoming].map((comment) => [comment.id, comment])).values()].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
  )
}
