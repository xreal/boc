import { Option, Schema } from "effect"
import { failJira } from "../domain/errors"
import {
  JIRA_ISSUE_STATUS_BATCH_SIZE,
  JiraIssueStatusKey,
  mapJiraIssueStatus,
} from "../domain/status"
import type { JiraIssueStatusesResult } from "../rpcs"
import { decodeUnknownJson, jiraRequest } from "./client"
import type { JiraAuth } from "./board-client"

export async function fetchJiraIssueStatuses(
  auth: JiraAuth,
  issueKeys: readonly string[],
): Promise<JiraIssueStatusesResult> {
  const keys = [...new Set(issueKeys.map((key) => key.trim().toUpperCase()))]
  if (
    keys.length === 0 ||
    keys.length > JIRA_ISSUE_STATUS_BATCH_SIZE ||
    keys.some((key) => !Schema.is(JiraIssueStatusKey)(key))
  ) {
    return failJira("malformed")
  }

  const result = await jiraRequest({
    ...auth,
    method: "POST",
    path: "/rest/api/3/search/jql",
    body: {
      jql: `issuekey in (${keys.join(", ")})`,
      maxResults: keys.length,
      fields: ["status"],
    },
    retry: "safe-read",
  })
  if (!result.ok) return result

  const page = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.Struct({ issues: Schema.Array(Schema.Unknown) }))(
      Option.getOrUndefined(decodeUnknownJson(result.text)),
    ),
  )
  if (!page) return failJira("malformed")
  return {
    ok: true,
    statuses: page.issues.flatMap((raw) => {
      const status = mapJiraIssueStatus(raw)
      return status ? [status] : []
    }),
  }
}
