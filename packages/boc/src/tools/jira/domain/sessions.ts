import { Schema } from "effect"

export const JiraSessionLink = Schema.Struct({
  issueUrl: Schema.String,
  title: Schema.String,
  draftID: Schema.String,
  server: Schema.String,
  sessionID: Schema.optionalKey(Schema.String),
  createdAt: Schema.Number,
})
export type JiraSessionLink = typeof JiraSessionLink.Type

export function jiraSessionPrompt(
  issue: { key: string; summary: string; url: string; description?: string },
  before: string,
  after: string,
) {
  return [before.trim(), `${issue.key}: ${issue.summary}`, issue.url, issue.description?.trim(), after.trim()]
    .filter(Boolean)
    .join("\n\n")
}
