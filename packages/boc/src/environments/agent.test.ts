import { expect, test } from "bun:test"
import { Effect } from "effect"
import { environmentContextHook } from "./agent"

test("injects the configured checkout URL into agent system context", async () => {
  const system: Array<{ type: "text"; text: string }> = []
  const hook = environmentContextHook(
    { projectID: "project", directory: "/workspace" },
    {
      agentContext: async () => ({
        stackID: "boc-204-environments",
        host: "boc-204-environments.bergfreunde.de.localhost",
        url: "https://boc-204-environments.bergfreunde.de.localhost/",
      }),
    },
  )

  await Effect.runPromise(hook({ system }))

  expect(system).toHaveLength(1)
  expect(system[0].text).toContain("URL: https://boc-204-environments.bergfreunde.de.localhost/")
  expect(system[0].text).toContain("Host: boc-204-environments.bergfreunde.de.localhost")
  expect(system[0].text).toContain("Stack: boc-204-environments")
})

test("does not add agent context for an unconfigured checkout", async () => {
  const system: Array<{ type: "text"; text: string }> = []
  const hook = environmentContextHook(
    { projectID: "project", directory: "/workspace" },
    { agentContext: async () => undefined },
  )

  await Effect.runPromise(hook({ system }))

  expect(system).toEqual([])
})
