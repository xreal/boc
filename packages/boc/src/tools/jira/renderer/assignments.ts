import { createStore } from "solid-js/store"
import type { JiraIssueDetail, JiraIssueUser, JiraMutationFailure } from "../domain/issue"
import type { JiraCollaborationApi } from "./resource"

export function createJiraAssignments(
  api: JiraCollaborationApi,
  update: (issueUrl: string, user: JiraIssueUser | null) => void,
) {
  const [state, setState] = createStore<Record<string, { pending: boolean; failure?: JiraMutationFailure }>>({})
  return {
    state,
    async assign(issue: JiraIssueDetail, user: JiraIssueUser | null) {
      if (state[issue.url]?.pending) return
      const previous = issue.assignee ? { ...issue.assignee } : null
      const issueUrl = issue.url
      const issueKey = issue.key
      setState(issueUrl, { pending: true, failure: undefined })
      update(issueUrl, user)
      const result = await api
        .assignIssue({ issueKey, accountId: user?.accountId ?? null })
        .catch(() => ({ ok: false, category: "network", outcome: "unknown" }) as const)
      if (result.ok) {
        update(issueUrl, result.issue.assignee)
        setState(issueUrl, { pending: false, failure: undefined })
        return result
      }
      if (result.outcome === "rejected") update(issueUrl, previous)
      if ("issue" in result && result.issue) update(issueUrl, result.issue.assignee)
      if (result.outcome === "unknown" && !("issue" in result && result.issue)) update(issueUrl, previous)
      setState(issueUrl, { pending: false, failure: result })
      return result
    },
  }
}
export type JiraAssignments = ReturnType<typeof createJiraAssignments>
