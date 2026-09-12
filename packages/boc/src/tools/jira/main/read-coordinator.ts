export type JiraReadScope =
  | "board"
  | "issue"
  | "issue-statuses"
  | "comments"
  | "assignees"
  | "pull-requests"
  | "attachment"
  | "branches"

export function createJiraReadCoordinator() {
  const active = new Map<string, { requestId: string; controller: AbortController }>()

  return {
    run<Value>(scope: JiraReadScope, requestId: string, read: (signal: AbortSignal) => Promise<Value>) {
      // Independent image tiles may read concurrently; other sections supersede their previous read.
      const key = scope === "attachment" ? `${scope}:${requestId}` : scope
      active.get(key)?.controller.abort()
      const current = { requestId, controller: new AbortController() }
      active.set(key, current)
      return read(current.controller.signal).finally(() => {
        if (active.get(key) === current) active.delete(key)
      })
    },
    cancel(scope: JiraReadScope, requestId: string) {
      const key = scope === "attachment" ? `${scope}:${requestId}` : scope
      const current = active.get(key)
      if (current?.requestId !== requestId) return
      current.controller.abort()
      active.delete(key)
    },
  }
}

export type JiraReadCoordinator = ReturnType<typeof createJiraReadCoordinator>
