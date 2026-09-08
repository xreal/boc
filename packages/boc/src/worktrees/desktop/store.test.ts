import { expect, test } from "bun:test"
import { Project } from "@opencode/schema/project"
import {
  getDefaultBackend,
  getProjectBackend,
  memoryWorktreePreferenceStore,
  setDefaultBackend,
  setProjectBackend,
} from "./store"

const alpha = { server: "sidecar", projectID: Project.ID.make("alpha") }
const beta = { server: "sidecar", projectID: Project.ID.make("beta") }

test("defaults to Git and isolates project overrides by server and project", () => {
  const store = memoryWorktreePreferenceStore()
  expect(getDefaultBackend(store)).toBe("git")

  expect(setDefaultBackend(store, "rift")).toBe("rift")
  expect(setProjectBackend(store, alpha, "git")).toBe("git")
  expect(setProjectBackend(store, { ...alpha, server: "https://example.test" }, "rift")).toBe("rift")

  expect(getDefaultBackend(store)).toBe("rift")
  expect(getProjectBackend(store, alpha)).toBe("git")
  expect(getProjectBackend(store, beta)).toBeUndefined()
  expect(getProjectBackend(store, { ...alpha, server: "https://example.test" })).toBe("rift")
})

test("clears one project override without disturbing the others", () => {
  const store = memoryWorktreePreferenceStore()
  setProjectBackend(store, alpha, "rift")
  setProjectBackend(store, beta, "git")

  expect(setProjectBackend(store, alpha, undefined)).toBeUndefined()
  expect(getProjectBackend(store, alpha)).toBeUndefined()
  expect(getProjectBackend(store, beta)).toBe("git")
})

test("ignores malformed persisted preferences", () => {
  const store = memoryWorktreePreferenceStore({ defaultBackend: "unknown", projects: { broken: "rift" } })
  expect(getDefaultBackend(store)).toBe("git")
  expect(getProjectBackend(store, alpha)).toBeUndefined()
})
