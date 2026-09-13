import { onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createLatestRequest } from "./latest-request"

export type JiraCollaborationApi = Pick<
  BocDesktopAPI["jira"],
  | "listComments"
  | "searchAssignees"
  | "assignIssue"
  | "listPullRequests"
  | "cancelIssueResourceRead"
  | "previewAttachment"
  | "downloadAttachment"
  | "listBranches"
>

/** One section owns its read identity and retains its last successful value during refresh. */
export function createJiraResource<Value, Failure>(input: {
  api: JiraCollaborationApi
  resource: "comments" | "assignees" | "pull-requests" | "branches"
}) {
  const requests = createLatestRequest({
    prefix: `${input.resource}-${crypto.randomUUID()}`,
    cancel: (requestId) => {
      void input.api.cancelIssueResourceRead({ resource: input.resource, requestId }).catch(() => undefined)
    },
  })
  const [state, setState] = createStore({
    phase: "idle" as "idle" | "loading" | "ready" | "failed",
    data: undefined as Value | undefined,
    failure: undefined as Failure | undefined,
    showLoader: false,
  })
  onCleanup(requests.invalidate)
  return {
    state,
    setData: (data: Value) => setState("data", () => data),
    cancel: () => {
      requests.invalidate()
      setState({ phase: state.data === undefined ? "idle" : "ready", showLoader: false })
    },
    async load(
      read: (requestId: string) => Promise<{ ok: true; value: Value } | { ok: false; failure: Failure }>,
      networkFailure: Failure,
    ) {
      const request = requests.begin()
      setState({ phase: "loading", failure: undefined, showLoader: false })
      const timer = setTimeout(() => {
        if (requests.isCurrent(request)) setState("showLoader", true)
      }, 180)
      const result = await read(request.requestId).catch(() => ({ ok: false as const, failure: networkFailure }))
      clearTimeout(timer)
      if (!requests.isCurrent(request)) return
      requests.finish(request)
      if (result.ok) setState({ phase: "ready", data: result.value, failure: undefined, showLoader: false })
      if (!result.ok) setState({ phase: "failed", failure: result.failure, showLoader: false })
      return result.ok
    },
  }
}
