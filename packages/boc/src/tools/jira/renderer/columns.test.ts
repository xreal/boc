import { describe, expect, test } from "bun:test"
import type { JiraColumnGroup } from "../domain/board"
import { jiraBoardFocusTarget } from "./columns"

const groups: JiraColumnGroup[] = [
  {
    column: { id: "todo", name: "To do", statusIds: ["1"] },
    issues: [
      { id: "1", key: "ONE-1", summary: "One", labels: [], url: "https://acme.atlassian.net/browse/ONE-1" },
      { id: "2", key: "ONE-2", summary: "Two", labels: [], url: "https://acme.atlassian.net/browse/ONE-2" },
    ],
  },
  {
    column: { id: "doing", name: "Doing", statusIds: ["2"] },
    issues: [{ id: "3", key: "ONE-3", summary: "Three", labels: [], url: "https://acme.atlassian.net/browse/ONE-3" }],
  },
  { column: { id: "done", name: "Done", statusIds: ["3"] }, issues: [] },
]

describe("Jira board keyboard traversal", () => {
  test("moves through cards and between columns without leaving valid bounds", () => {
    expect(jiraBoardFocusTarget(groups, 0, 0, "ArrowDown")).toEqual({ columnIndex: 0, cardIndex: 1 })
    expect(jiraBoardFocusTarget(groups, 0, 1, "ArrowUp")).toEqual({ columnIndex: 0, cardIndex: 0 })
    expect(jiraBoardFocusTarget(groups, 0, 1, "ArrowRight")).toEqual({ columnIndex: 1, cardIndex: 0 })
    expect(jiraBoardFocusTarget(groups, 1, 0, "ArrowRight")).toEqual({ columnIndex: 2 })
    expect(jiraBoardFocusTarget(groups, 0, 0, "ArrowLeft")).toBeUndefined()
  })

  test("enters a column and supports Home and End", () => {
    expect(jiraBoardFocusTarget(groups, 0, undefined, "Enter")).toEqual({ columnIndex: 0, cardIndex: 0 })
    expect(jiraBoardFocusTarget(groups, 0, 0, "End")).toEqual({ columnIndex: 0, cardIndex: 1 })
    expect(jiraBoardFocusTarget(groups, 0, 1, "Home")).toEqual({ columnIndex: 0, cardIndex: 0 })
    expect(jiraBoardFocusTarget(groups, 0, 0, "ArrowUp")).toEqual({ columnIndex: 0 })
  })
})
