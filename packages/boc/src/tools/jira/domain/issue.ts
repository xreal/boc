import { Option, Schema } from "effect"
import { adfToMarkdown } from "./adf"
import { jiraAssetUrl, mapJiraBoardIssue } from "./board"
import { JIRA_ERROR_CATEGORIES } from "./errors"
import { compact } from "./compact"

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

export const JiraRelatedIssue = Schema.Struct({
  key: JiraIssueKey,
  summary: Schema.String,
  statusName: Schema.optionalKey(Schema.String),
  statusCategory: Schema.optionalKey(Schema.String),
  issueTypeName: Schema.optionalKey(Schema.String),
})
export type JiraRelatedIssue = typeof JiraRelatedIssue.Type

export const JiraIssueLink = Schema.Struct({
  id: Schema.String,
  relationship: Schema.String,
  issue: JiraRelatedIssue,
})

export const JiraAttachmentId = Schema.String.check(Schema.isPattern(/^\d+$/), Schema.isMaxLength(128))
export const JIRA_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
export const JiraAttachment = Schema.Struct({
  id: JiraAttachmentId,
  filename: Schema.NonEmptyString,
  mimeType: Schema.String,
  size: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})
export type JiraAttachment = typeof JiraAttachment.Type

export function jiraAttachmentIsImage(attachment: JiraAttachment) {
  return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"].includes(attachment.mimeType)
}

export const JiraIssueDetail = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  summary: Schema.String,
  description: Schema.optionalKey(Schema.String),
  statusName: Schema.optionalKey(Schema.String),
  assignee: Schema.NullOr(JiraIssueUser),
  reporter: Schema.optionalKey(JiraIssueUser),
  parent: Schema.optionalKey(JiraRelatedIssue),
  subtasks: Schema.Array(JiraRelatedIssue),
  links: Schema.Array(JiraIssueLink),
  attachments: Schema.Array(JiraAttachment),
  issueTypeName: Schema.optionalKey(Schema.String),
  priorityName: Schema.optionalKey(Schema.String),
  issueTypeIconUrl: Schema.optionalKey(Schema.String),
  subtask: Schema.optionalKey(Schema.Boolean),
  storyPoints: Schema.optionalKey(Schema.Number),
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

export function mapJiraIssueDetail(
  raw: unknown,
  origin: string,
  storyPointFields: readonly string[] = [],
): JiraIssueDetail | undefined {
  const issue = mapJiraBoardIssue(raw, origin, storyPointFields)
  const detail = Option.getOrUndefined(
    Schema.decodeUnknownOption(
      Schema.Struct({
        fields: Schema.Struct({
          description: Schema.optionalKey(Schema.Unknown),
          assignee: Schema.Unknown,
          reporter: Schema.optionalKey(Schema.Unknown),
          parent: Schema.optionalKey(Schema.Unknown),
          subtasks: Schema.optionalKey(Schema.Array(Schema.Unknown)),
          issuelinks: Schema.optionalKey(Schema.Array(Schema.Unknown)),
          attachment: Schema.optionalKey(Schema.Array(Schema.Unknown)),
        }),
      }),
    )(raw),
  )
  if (!issue || !detail) return
  const assignee = detail.fields.assignee === null ? null : mapJiraUser(detail.fields.assignee, origin)
  if (assignee === undefined) return
  const attachments = (detail.fields.attachment ?? []).flatMap((raw) => {
    const attachment = Option.getOrUndefined(Schema.decodeUnknownOption(JiraAttachment)(raw))
    return attachment ? [attachment] : []
  })
  return compact({
    id: issue.id,
    key: issue.key,
    summary: issue.summary,
    labels: issue.labels,
    url: issue.url,
    assignee,
    description: adfToMarkdown(detail.fields.description, attachments),
    reporter: mapJiraUser(detail.fields.reporter, origin),
    parent: mapRelatedIssue(detail.fields.parent),
    subtasks: (detail.fields.subtasks ?? []).flatMap((raw) => {
      const issue = mapRelatedIssue(raw)
      return issue ? [issue] : []
    }),
    links: (detail.fields.issuelinks ?? []).flatMap((raw) => {
      const link = Option.getOrUndefined(Schema.decodeUnknownOption(RawIssueLink)(raw))
      if (!link) return []
      const issue = mapRelatedIssue(link.inwardIssue ?? link.outwardIssue)
      const relationship = link.inwardIssue ? link.type.inward : link.type.outward
      return issue ? [{ id: link.id, relationship, issue }] : []
    }),
    attachments,
    statusName: issue.statusName,
    issueTypeName: issue.issueTypeName,
    issueTypeIconUrl: issue.issueTypeIconUrl,
    subtask: issue.subtask,
    storyPoints: issue.storyPoints,
    priorityName: issue.priorityName,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  })
}

const RawRelatedIssue = Schema.Struct({
  key: JiraIssueKey,
  fields: Schema.Struct({
    summary: Schema.String,
    status: Schema.optionalKey(
      Schema.NullOr(
        Schema.Struct({
          name: Schema.String,
          statusCategory: Schema.optionalKey(Schema.Struct({ key: Schema.String })),
        }),
      ),
    ),
    issuetype: Schema.optionalKey(Schema.Struct({ name: Schema.String })),
  }),
})
const RawIssueLink = Schema.Struct({
  id: Schema.String,
  type: Schema.Struct({ inward: Schema.String, outward: Schema.String }),
  inwardIssue: Schema.optionalKey(Schema.Unknown),
  outwardIssue: Schema.optionalKey(Schema.Unknown),
})

function mapRelatedIssue(raw: unknown): JiraRelatedIssue | undefined {
  const issue = Option.getOrUndefined(Schema.decodeUnknownOption(RawRelatedIssue)(raw))
  if (!issue) return
  return compact({
    key: issue.key,
    summary: issue.fields.summary,
    statusName: issue.fields.status?.name,
    statusCategory: issue.fields.status?.statusCategory?.key,
    issueTypeName: issue.fields.issuetype?.name,
  })
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
