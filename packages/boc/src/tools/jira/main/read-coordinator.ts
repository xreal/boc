export type JiraReadScope = "board" | "issue"

export function createJiraReadCoordinator() {
  const active = new Map<JiraReadScope, { requestId: string; controller: AbortController }>()

  return {
    run<Value>(scope: JiraReadScope, requestId: string, read: (signal: AbortSignal) => Promise<Value>) {
      active.get(scope)?.controller.abort()
      const current = { requestId, controller: new AbortController() }
      active.set(scope, current)
      return read(current.controller.signal).finally(() => {
        if (active.get(scope) === current) active.delete(scope)
      })
    },
    cancel(scope: JiraReadScope, requestId: string) {
      const current = active.get(scope)
      if (current?.requestId !== requestId) return
      current.controller.abort()
      active.delete(scope)
    },
  }
}

export type JiraReadCoordinator = ReturnType<typeof createJiraReadCoordinator>
