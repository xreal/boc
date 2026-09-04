export type LatestRequest = {
  generation: number
  requestId: string
}

export function createLatestRequest(input: { prefix: string; cancel: (requestId: string) => void }) {
  let generation = 0
  let requestId: string | undefined

  const invalidate = () => {
    generation += 1
    if (!requestId) return
    input.cancel(requestId)
    requestId = undefined
  }

  return {
    begin(): LatestRequest {
      invalidate()
      requestId = `${input.prefix}-${Date.now().toString(36)}-${generation.toString(36)}`
      return { generation, requestId }
    },
    isCurrent(request: LatestRequest) {
      return request.generation === generation && request.requestId === requestId
    },
    finish(request: LatestRequest) {
      if (request.generation === generation && request.requestId === requestId) requestId = undefined
    },
    invalidate,
  }
}
