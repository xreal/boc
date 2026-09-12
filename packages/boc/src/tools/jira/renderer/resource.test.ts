import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createJiraFixtureApi } from "../fixtures/issue"
import { createJiraResource } from "./resource"

test("A → B → A reads accept only the latest request, even when cancellation is ignored", async () => {
  const fixture = createJiraFixtureApi()
  const scope = createRoot((dispose) => ({
    dispose,
    resource: createJiraResource<string, string>({ api: fixture.api, resource: "assignees" }),
  }))
  const firstA = Promise.withResolvers<{ ok: true; value: string }>()
  const b = Promise.withResolvers<{ ok: false; failure: string }>()
  const latestA = Promise.withResolvers<{ ok: true; value: string }>()
  const first = scope.resource.load(() => firstA.promise, "network")
  const second = scope.resource.load(() => b.promise, "network")
  const latest = scope.resource.load(() => latestA.promise, "network")
  latestA.resolve({ ok: true, value: "current A" })
  await latest
  firstA.resolve({ ok: true, value: "obsolete A" })
  b.resolve({ ok: false, failure: "obsolete failure" })
  await Promise.all([first, second])
  expect(scope.resource.state.data).toBe("current A")
  expect(scope.resource.state.failure).toBeUndefined()
  expect(fixture.calls.cancellations).toHaveLength(2)
  scope.dispose()
})
