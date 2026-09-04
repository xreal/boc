import { describe, expect, test } from "bun:test"
import type { JiraColumnGroup } from "../domain/board"
import { jiraRelativeTime } from "./time"
import { jiraColumnTone, jiraPriorityTone } from "./tone"

const column = (id: string): JiraColumnGroup => ({ column: { id, name: id, statusIds: [] }, issues: [] })

describe("Jira board tones", () => {
  test("reads the status category from the column position", () => {
    const groups = [column("todo"), column("doing"), column("review"), column("done")]
    expect(jiraColumnTone(groups, 0)).toBe("neutral")
    expect(jiraColumnTone(groups, 1)).toBe("info")
    expect(jiraColumnTone(groups, 2)).toBe("info")
    expect(jiraColumnTone(groups, 3)).toBe("success")
  })

  test("keeps the done tone on the last mapped column when unmapped issues trail it", () => {
    const groups = [column("todo"), column("done"), column("unmapped")]
    expect(jiraColumnTone(groups, 1)).toBe("success")
    expect(jiraColumnTone(groups, 2)).toBe("warning")
  })

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
