import { Option, Schema } from "effect"
import { failJira } from "../domain/errors"
import {
  JiraAccountId,
  JiraIssueKey,
  JiraPageOffset,
  JIRA_COMMENT_PAGE_SIZE,
  JIRA_ISSUE_STATUS_BATCH_SIZE,
  mapJiraComment,
  mapJiraCommentPage,
  mapJiraIssueDetail,
  mapJiraIssueStatus,
  mapJiraUser,
} from "../domain/issue"
import { markdownToAdf } from "../domain/markdown-to-adf"
import type {
  JiraAddCommentResult,
  JiraAssignResult,
  JiraAssigneesResult,
  JiraCommentsResult,
  JiraIssueResult,
  JiraIssueStatusesResult,
} from "../rpcs"
import { decodeUnknownJson, jiraRequest, type JiraAuth } from "./client"

export async function fetchJiraIssue(
  auth: JiraAuth,
  issueKey: string,
  storyPointFields: readonly string[] = [],
): Promise<JiraIssueResult> {
  if (!Schema.is(JiraIssueKey)(issueKey)) return failJira("malformed")
  const result = await jiraRequest({
    ...auth,
    path: `/rest/api/3/issue/${issueKey}`,
    query: {
      fields: [
        "summary,status,assignee,issuetype,priority,labels,created,updated,description,reporter,parent,subtasks,issuelinks,attachment",
        ...storyPointFields,
      ].join(","),
    },
    retry: "safe-read",
  })
  if (!result.ok) return result
  const issue = mapJiraIssueDetail(
    Option.getOrUndefined(decodeUnknownJson(result.text)),
    auth.origin.origin,
    storyPointFields,
  )
  return issue ? { ok: true, issue } : failJira("malformed")
}

export async function fetchJiraIssueStatuses(
  auth: JiraAuth,
  issueKeys: readonly string[],
): Promise<JiraIssueStatusesResult> {
  const keys = [...new Set(issueKeys.map((key) => key.trim().toUpperCase()))]
  if (
    keys.length === 0 ||
    keys.length > JIRA_ISSUE_STATUS_BATCH_SIZE ||
    keys.some((key) => !Schema.is(JiraIssueKey)(key))
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

export async function fetchJiraComments(
  auth: JiraAuth,
  input: { issueKey: string; startAt: number },
): Promise<JiraCommentsResult> {
  if (!Schema.is(JiraIssueKey)(input.issueKey) || !Schema.is(JiraPageOffset)(input.startAt))
    return failJira("malformed")
  const result = await jiraRequest({
    ...auth,
    path: `/rest/api/3/issue/${input.issueKey}/comment`,
    query: { startAt: input.startAt, maxResults: JIRA_COMMENT_PAGE_SIZE, orderBy: "-created" },
    retry: "safe-read",
  })
  if (!result.ok) return result
  const page = mapJiraCommentPage(Option.getOrUndefined(decodeUnknownJson(result.text)), auth.origin.origin)
  return page ? { ok: true, page } : failJira("malformed")
}

export async function searchJiraAssignees(
  auth: JiraAuth,
  input: { issueKey: string; query: string },
): Promise<JiraAssigneesResult> {
  if (!Schema.is(JiraIssueKey)(input.issueKey) || input.query.length > 255) return failJira("malformed")
  const result = await jiraRequest({
    ...auth,
    path: "/rest/api/3/user/assignable/search",
    query: { issueKey: input.issueKey, query: input.query.trim(), startAt: 0, maxResults: 20 },
    retry: "safe-read",
  })
  if (!result.ok) return result
  const raw = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Unknown)))(result.text),
  )
  if (!raw) return failJira("malformed")
  const users = raw.flatMap((value) => {
    const user = mapJiraUser(value, auth.origin.origin)
    return user ? [user] : []
  })
  return { ok: true, users: [...new Map(users.map((user) => [user.accountId, user])).values()] }
}

export async function addJiraComment(
  auth: JiraAuth,
  input: { issueKey: string; text: string },
): Promise<JiraAddCommentResult> {
  const converted = markdownToAdf(input.text)
  if (!Schema.is(JiraIssueKey)(input.issueKey) || !converted.ok)
    return { ...failJira("malformed"), outcome: "rejected" }
  const result = await jiraRequest({
    ...auth,
    signal: undefined,
    path: `/rest/api/3/issue/${input.issueKey}/comment`,
    method: "POST",
    body: { body: converted.document },
    retry: "write",
  })
  if (!result.ok) return result
  const comment = mapJiraComment(Option.getOrUndefined(decodeUnknownJson(result.text)), auth.origin.origin)
  return comment ? { ok: true, comment } : { ...failJira("malformed"), outcome: "unknown" }
}

export async function assignJiraIssue(
  auth: JiraAuth,
  input: { issueKey: string; accountId: string | null },
): Promise<JiraAssignResult> {
  if (!Schema.is(JiraIssueKey)(input.issueKey) || !Schema.is(Schema.NullOr(JiraAccountId))(input.accountId)) {
    return { ...failJira("malformed"), outcome: "rejected" }
  }
  const result = await jiraRequest({
    ...auth,
    signal: undefined,
    path: `/rest/api/3/issue/${input.issueKey}/assignee`,
    method: "PUT",
    body: { accountId: input.accountId },
    retry: "write",
  })
  if (!result.ok && result.outcome === "rejected") return result
  // Canonical reconciliation is a read; the PUT above is never replayed.
  const canonical = await fetchJiraIssue({ ...auth, signal: undefined }, input.issueKey)
  if (
    canonical.ok &&
    (result.ok ||
      canonical.issue.assignee?.accountId === input.accountId ||
      (canonical.issue.assignee === null && input.accountId === null))
  )
    return { ok: true, issue: canonical.issue }
  return {
    ok: false,
    category: result.ok ? "network" : result.category,
    outcome: "unknown",
    ...(canonical.ok ? { issue: canonical.issue } : {}),
  }
}
