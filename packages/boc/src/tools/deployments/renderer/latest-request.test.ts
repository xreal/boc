import { describe, expect, test } from "bun:test"
import { createLatestDeploymentRequest } from "./latest-request"

describe("latest deployment request", () => {
  test("cancels superseded reads and suppresses stale results", () => {
    const cancelled: string[] = []
    const requests = createLatestDeploymentRequest({ cancel: (requestId) => cancelled.push(requestId) })
    const stale = requests.begin()
    const current = requests.begin()

    expect(cancelled).toEqual([stale.requestId])
    expect(requests.isCurrent(stale)).toBe(false)
    expect(requests.isCurrent(current)).toBe(true)
  })

  test("does not cancel a completed read", () => {
    const cancelled: string[] = []
    const requests = createLatestDeploymentRequest({ cancel: (requestId) => cancelled.push(requestId) })
    const request = requests.begin()
    requests.finish(request)
    requests.invalidate()
    expect(cancelled).toEqual([])
  })
})
