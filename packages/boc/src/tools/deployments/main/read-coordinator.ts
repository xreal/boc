export function createDeploymentReadCoordinator() {
  const active = new Map<string, AbortController>()

  return {
    run<Value>(requestId: string, read: (signal: AbortSignal) => Promise<Value>) {
      active.get(requestId)?.abort()
      const controller = new AbortController()
      active.set(requestId, controller)
      return read(controller.signal).finally(() => {
        if (active.get(requestId) === controller) active.delete(requestId)
      })
    },
    cancel(requestId: string) {
      const controller = active.get(requestId)
      if (!controller) return
      controller.abort()
      active.delete(requestId)
    },
  }
}

export type DeploymentReadCoordinator = ReturnType<typeof createDeploymentReadCoordinator>
