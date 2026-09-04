import { describe, expect, test } from "bun:test"
import { laneLastViewedStorageKey } from "./lanes"

describe("Jira board lane last-viewed storage", () => {
  test("scopes the key to the connected site and board", () => {
    expect(laneLastViewedStorageKey("acme", 84)).toBe("jira-board-lanes:last-viewed:v1:acme:84")
  })
})
