import { describe, expect, test } from "bun:test"
import {
  MAX_SAVED_JIRA_BOARDS,
  JIRA_UNASSIGNED,
  boardIssuesJql,
  columnsFromConfiguration,
  configurationFilterId,
  filterIssues,
  groupIssuesByColumn,
  isJiraIssueKey,
  mapJiraBoardIssue,
  mapJiraBoardSummary,
  mapJiraSprint,
  normalizeSavedBoards,
  resolveSelectedBoardId,
  resolveSetupBoardId,
  resolveSprintId,
  selectableSprints,
  sortSprints,
  uniqueIssueNames,
  jiraIssueIsSubtask,
  jiraAssetUrl,
  storyPointFieldIds,
  type JiraBoardIssue,
  type JiraBoardSummary,
} from "./board"
import { boardConfigurationFixture, fieldListFixture, issueSearchIssue } from "../fixtures/board"

function issue(id: string, statusId?: string): JiraBoardIssue {
  return {
    id,
    key: `PLAT-${id}`,
    summary: `Issue ${id}`,
    ...(statusId ? { statusId } : {}),
    labels: [],
    url: `https://acme.atlassian.net/browse/PLAT-${id}`,
  }
}

function board(id: number): JiraBoardSummary {
  return { id, name: `Board ${id}`, type: id % 2 === 0 ? "scrum" : "kanban" }
}

describe("Jira board mapping", () => {
  test("maps native board columns and the filter id from a Cloud configuration", () => {
    expect(columnsFromConfiguration(boardConfigurationFixture, 84).map((column) => column.name)).toEqual([
      "To Do",
      "In progress",
      "Done",
    ])
    expect(columnsFromConfiguration(boardConfigurationFixture, 84)[1]).toEqual({
      id: "84:1",
      name: "In progress",
      statusIds: ["3"],
    })
    expect(configurationFilterId(boardConfigurationFixture)).toBe("1001")
  })

  test("maps scrum and kanban summaries and skips other board types", () => {
    expect(
      mapJiraBoardSummary({
        id: 84,
        name: "scrum board",
        type: "scrum",
        location: { projectKey: "PLAT", projectName: "Platform" },
      }),
    ).toEqual({
      id: 84,
      name: "scrum board",
      type: "scrum",
      projectKey: "PLAT",
      projectName: "Platform",
    })
    expect(mapJiraBoardSummary({ id: 1, name: "Simple", type: "simple" })).toBeUndefined()
  })

  test("maps issues and sprints without copying nested Jira objects", () => {
    expect(mapJiraBoardIssue(issueSearchIssue, "https://acme.atlassian.net")).toEqual({
      id: "10001",
      key: "PLAT-1",
      summary: "Render the Jira board",
      statusId: "10000",
      statusName: "To Do",
      assigneeName: "Mia Krystof",
      assigneeAvatarUrl:
        "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=24&s=24",
      issueTypeName: "Story",
      issueTypeIconUrl: "https://acme.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10315?size=medium",
      priorityName: "Medium",
      labels: ["board"],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T00:00:00.000Z",
      url: "https://acme.atlassian.net/browse/PLAT-1",
    })
    expect(mapJiraSprint({ id: 37, name: "Sprint 1", state: "active", goal: "Ship the board" })).toEqual({
      id: 37,
      name: "Sprint 1",
      state: "active",
      goal: "Ship the board",
    })
  })

  test("maps subtask, story points, and rejects unsafe asset URLs", () => {
    expect(
      mapJiraBoardIssue(
        {
          id: "10003",
          key: "PLAT-3",
          fields: {
            summary: "Write the failing test",
            issuetype: { name: "Sub-Task", iconUrl: "javascript:alert(1)" },
            assignee: { displayName: "Ada", avatarUrls: { "24x24": "https://evil.example/avatar.png" } },
            customfield_10016: 5,
          },
        },
        "https://acme.atlassian.net",
        ["customfield_10016"],
      ),
    ).toEqual({
      id: "10003",
      key: "PLAT-3",
      summary: "Write the failing test",
      issueTypeName: "Sub-Task",
      subtask: true,
      storyPoints: 5,
      assigneeName: "Ada",
      labels: [],
      url: "https://acme.atlassian.net/browse/PLAT-3",
    })
    expect(jiraIssueIsSubtask({ issueTypeName: "Sub-Task" })).toBe(true)
    expect(jiraIssueIsSubtask({ issueTypeName: "Story" })).toBe(false)
    expect(storyPointFieldIds(fieldListFixture)).toEqual(["customfield_10016"])
    expect(jiraAssetUrl("https://acme.atlassian.net/images/icons/story.svg", "https://acme.atlassian.net")).toBe(
      "https://acme.atlassian.net/images/icons/story.svg",
    )
    expect(jiraAssetUrl("javascript:alert(1)", "https://acme.atlassian.net")).toBeUndefined()
  })
})

describe("groupIssuesByColumn", () => {
  test("preserves native column order and keeps unmapped statuses visible", () => {
    const result = groupIssuesByColumn(
      [
        { id: "todo", name: "To do", statusIds: ["1"] },
        { id: "done", name: "Done", statusIds: ["3"] },
      ],
      [issue("1", "3"), issue("2", "2"), issue("3", "1")],
    )
    expect(result.map((group) => group.column.name)).toEqual(["To do", "Done", "Other"])
    expect(result.map((group) => group.issues.map((entry) => entry.id))).toEqual([["3"], ["1"], ["2"]])
  })
})

describe("filterIssues", () => {
  const issues = [
    {
      ...issue("1", "1"),
      summary: "Fix deployment failure",
      assigneeName: "Ada Lovelace",
      issueTypeName: "Bug",
      priorityName: "High",
    },
    { ...issue("2", "2"), summary: "Write release notes", issueTypeName: "Task", priorityName: "Low" },
  ]

  test("searches issue keys and summaries case-insensitively", () => {
    expect(filterIssues(issues, { search: "DEPLOYMENT" })).toEqual([issues[0]])
    expect(filterIssues(issues, { search: "plat-2" })).toEqual([issues[1]])
  })

  test("combines assignee, type, and priority filters and supports unassigned issues", () => {
    expect(
      filterIssues(issues, {
        assignee: "Ada Lovelace",
        issueType: "Bug",
        priority: "High",
      }),
    ).toEqual([issues[0]])
    expect(filterIssues(issues, { assignee: JIRA_UNASSIGNED })).toEqual([issues[1]])
    expect(uniqueIssueNames(issues, "assigneeName")).toEqual(["Ada Lovelace"])
  })
})

describe("Jira sprint selection", () => {
  const sprint = (id: number, state: string, endDate?: string) => ({
    id,
    name: `Sprint ${id}`,
    state,
    ...(endDate ? { endDate } : {}),
  })

  test("preserves a valid restored sprint and falls back to the active sprint", () => {
    const active = sprint(20, "active")
    const sprints = [active, sprint(30, "future"), sprint(10, "closed")]
    expect(resolveSprintId(30, sprints, active)).toBe(30)
    expect(resolveSprintId(999, sprints, active)).toBe(20)
    expect(resolveSprintId(undefined, [sprint(30, "future")])).toBe(30)
  })

  test("orders active and upcoming sprints before newest previous sprints", () => {
    const sprints = [
      sprint(10, "closed", "2026-05-01"),
      sprint(30, "future", "2026-08-01"),
      sprint(20, "active", "2026-07-01"),
      sprint(11, "closed", "2026-06-01"),
    ]
    expect(sortSprints(sprints).map((entry) => entry.id)).toEqual([20, 30, 11, 10])
    expect(selectableSprints(sprints).map((entry) => entry.id)).toEqual([20, 30])
  })
})

describe("saved boards", () => {
  test("keeps ten unique boards and drops a default that is not saved", () => {
    const saved = Array.from({ length: MAX_SAVED_JIRA_BOARDS + 2 }, (_, index) => board(index + 1))
    const normalized = normalizeSavedBoards([saved[0]!, saved[0]!, ...saved.slice(1)], 99)
    expect(normalized.savedBoards).toHaveLength(MAX_SAVED_JIRA_BOARDS)
    expect(normalized.savedBoards[0]?.id).toBe(1)
    expect(normalized.defaultBoardId).toBeUndefined()
    expect(normalizeSavedBoards(saved.slice(0, 3), 2).defaultBoardId).toBe(2)
  })

  test("resolves the default board, then the first saved board still available", () => {
    const available = [board(4), board(8), board(2)]
    expect(resolveSelectedBoardId(undefined, { savedBoards: [board(8), board(2)], defaultBoardId: 2 }, available)).toBe(2)
    expect(resolveSelectedBoardId(8, { savedBoards: [board(2)], defaultBoardId: 2 }, available)).toBe(8)
    expect(resolveSelectedBoardId(undefined, { savedBoards: [board(9)] }, available)).toBe(4)
  })

  test("does not pick a board until a default exists or the session already selected one", () => {
    const available = [board(4), board(8)]
    expect(resolveSetupBoardId(undefined, { savedBoards: [] }, available)).toBeUndefined()
    expect(resolveSetupBoardId(undefined, { savedBoards: [board(8)] }, available)).toBeUndefined()
    expect(resolveSetupBoardId(undefined, { savedBoards: [board(8)], defaultBoardId: 8 }, available)).toBe(8)
    expect(resolveSetupBoardId(4, { savedBoards: [] }, available)).toBe(4)
  })
})

describe("board issue JQL", () => {
  test("scopes issues by the board filter and an optional sprint", () => {
    expect(boardIssuesJql({ filterId: "1001" })).toBe("filter = 1001")
    expect(boardIssuesJql({ filterId: "1001", sprintId: 37 })).toBe("filter = 1001 AND sprint = 37")
    expect(boardIssuesJql({ filterId: "1001", subQuery: 'fixVersion = "1.0"' })).toBe(
      'filter = 1001 AND (fixVersion = "1.0")',
    )
    expect(boardIssuesJql({ filterId: "1001", sprintId: 37, subQuery: "ignored" })).toBe("filter = 1001 AND sprint = 37")
  })
})

describe("isJiraIssueKey", () => {
  test("accepts a full issue key", () => {
    expect(isJiraIssueKey("PLAT-1")).toBe(true)
    expect(isJiraIssueKey("PC_FAST-12")).toBe(true)
    expect(isJiraIssueKey("plat")).toBe(false)
  })
})
