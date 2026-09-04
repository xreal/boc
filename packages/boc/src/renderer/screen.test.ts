import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { useBocDesktop } from "./desktop"
import { bocScreenState } from "./screen"

test("reports desktop-required when no desktop provider is mounted", () => {
  createRoot((dispose) => {
    expect(bocScreenState("jira", useBocDesktop())).toBe("desktop-required")
    expect(bocScreenState("deployments", useBocDesktop())).toBe("desktop-required")
    dispose()
  })
})

test("reports not-found for an unknown extension", () => {
  expect(bocScreenState("unknown", undefined)).toBe("not-found")
})
