import { describe, expect, test } from "bun:test"
import { createLatestRequest } from "./latest-request"

describe("latest Jira request", () => {
  test("cancels the previous request and suppresses its result", () => {
    const cancelled: string[] = []
    const requests = createLatestRequest({ prefix: "board", cancel: (requestId) => cancelled.push(requestId) })
    const stale = requests.begin()
    const latest = requests.begin()

    expect(cancelled).toEqual([stale.requestId])
    expect(requests.isCurrent(stale)).toBe(false)
    expect(requests.isCurrent(latest)).toBe(true)
  })

  test("does not cancel a completed request", () => {
    const cancelled: string[] = []
    const requests = createLatestRequest({ prefix: "issue", cancel: (requestId) => cancelled.push(requestId) })
    const request = requests.begin()

    requests.finish(request)
    requests.invalidate()

    expect(requests.isCurrent(request)).toBe(false)
    expect(cancelled).toEqual([])
  })
})
