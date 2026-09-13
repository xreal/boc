import { Option, Schema } from "effect"

export const JIRA_ISSUE_STATUS_CACHE_MS = 60_000
export const JIRA_ISSUE_STATUS_BATCH_SIZE = 100

export const JiraIssueStatusKey = Schema.String.check(
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z][A-Za-z0-9_]*-\d+$/),
)

export const JiraIssueStatus = Schema.Struct({
  key: JiraIssueStatusKey,
  statusName: Schema.NonEmptyString,
})
export type JiraIssueStatus = typeof JiraIssueStatus.Type

const RawIssueStatus = Schema.Struct({
  key: JiraIssueStatusKey,
  fields: Schema.Struct({
    status: Schema.optionalKey(Schema.NullOr(Schema.Struct({ name: Schema.NonEmptyString }))),
  }),
})

export function mapJiraIssueStatus(raw: unknown): JiraIssueStatus | undefined {
  const issue = Option.getOrUndefined(Schema.decodeUnknownOption(RawIssueStatus)(raw))
  const statusName = issue?.fields.status?.name
  if (!issue || !statusName) return
  return { key: issue.key, statusName }
}
