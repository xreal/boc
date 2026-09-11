export type LatestDeploymentRequest = {
  generation: number
  requestId: string
}

export function createLatestDeploymentRequest(input: { prefix?: string; cancel: (requestId: string) => void }) {
  let generation = 0
  let requestId: string | undefined

  const invalidate = () => {
    generation += 1
    if (!requestId) return
    input.cancel(requestId)
    requestId = undefined
  }

  return {
    begin(): LatestDeploymentRequest {
      invalidate()
      requestId = `${input.prefix ?? "fleet"}-${Date.now().toString(36)}-${generation.toString(36)}`
      return { generation, requestId }
    },
    isCurrent(request: LatestDeploymentRequest) {
      return request.generation === generation && request.requestId === requestId
    },
    finish(request: LatestDeploymentRequest) {
      if (request.generation === generation && request.requestId === requestId) requestId = undefined
    },
    invalidate,
  }
}
