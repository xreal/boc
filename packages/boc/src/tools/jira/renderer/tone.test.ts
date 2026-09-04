import { describe, expect, test } from "bun:test"
import { jiraRelativeTime } from "./time"
import { jiraPriorityTone } from "./tone"

describe("Jira board tones", () => {
  test("maps common Jira priority names", () => {
    expect(jiraPriorityTone("Highest")).toBe("danger")
    expect(jiraPriorityTone("High")).toBe("warning")
    expect(jiraPriorityTone("Medium")).toBe("neutral")
    expect(jiraPriorityTone("Lowest")).toBe("info")
    expect(jiraPriorityTone(undefined)).toBe("neutral")
  })
})

describe("Jira relative time", () => {
  const now = Date.parse("2026-09-04T12:00:00.000Z")

  test("formats Jira timestamps with colon-less offsets", () => {
    expect(jiraRelativeTime("2026-09-03T16:00:00.000+0000", "en", now)).toBe("20h ago")
    expect(jiraRelativeTime("2026-09-01T12:00:00.000Z", "en", now)).toBe("3d ago")
    expect(jiraRelativeTime("2026-08-27T12:00:00.000Z", "en", now)).toBe("1w ago")
    expect(jiraRelativeTime("2026-09-04T11:59:50.000Z", "en", now)).toBe("now")
  })

  test("ignores missing or unreadable dates", () => {
    expect(jiraRelativeTime(undefined, "en", now)).toBeUndefined()
    expect(jiraRelativeTime("yesterday", "en", now)).toBeUndefined()
  })
})
