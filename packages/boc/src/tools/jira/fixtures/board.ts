import { jsonResponse } from "./http"

export const boardListPageOne = {
  isLast: false,
  maxResults: 2,
  startAt: 0,
  values: [
    {
      id: 84,
      name: "scrum board",
      self: "https://acme.atlassian.net/rest/agile/1.0/board/84",
      type: "scrum",
      location: { projectKey: "PLAT", projectName: "Platform" },
    },
    {
      id: 92,
      name: "kanban board",
      self: "https://acme.atlassian.net/rest/agile/1.0/board/92",
      type: "kanban",
    },
  ],
}

export const boardListPageTwo = {
  isLast: true,
  maxResults: 2,
  startAt: 2,
  values: [
    {
      id: 101,
      name: "Support",
      type: "kanban",
      location: { name: "Support desk" },
    },
    {
      id: 7,
      name: "Hidden simple board",
      type: "simple",
    },
  ],
}

export const boardFixture = {
  id: 84,
  name: "scrum board",
  type: "scrum",
  location: { projectKey: "PLAT", projectName: "Platform" },
}

export const boardConfigurationFixture = {
  id: 84,
  name: "scrum board",
  type: "scrum",
  filter: {
    id: "1001",
    self: "https://acme.atlassian.net/filter/1001",
  },
  columnConfig: {
    columns: [
      {
        name: "To Do",
        statuses: [
          { id: "1", self: "https://acme.atlassian.net/status/1" },
          { id: "4", self: "https://acme.atlassian.net/status/4" },
        ],
      },
      {
        max: 4,
        min: 2,
        name: "In progress",
        statuses: [{ id: "3", self: "https://acme.atlassian.net/status/3" }],
      },
      {
        name: "Done",
        statuses: [{ id: "5", self: "https://acme.atlassian.net/status/5" }],
      },
    ],
    constraintType: "issueCount",
  },
}

export const sprintListFixture = {
  isLast: true,
  maxResults: 50,
  startAt: 0,
  values: [
    {
      id: 37,
      state: "active",
      name: "Sprint 1",
      startDate: "2026-09-01T00:00:00.000+00:00",
      endDate: "2026-09-14T00:00:00.000+00:00",
      goal: "Ship the board",
    },
    {
      id: 72,
      state: "future",
      name: "Sprint 2",
      goal: "Polish",
    },
  ],
}

export const issueSearchIssue = {
  id: "10001",
  key: "PLAT-1",
  fields: {
    summary: "Render the Jira board",
    status: { id: "10000", name: "To Do" },
    assignee: {
      displayName: "Mia Krystof",
      avatarUrls: {
        "24x24":
          "https://avatar-management--avatars.server-location.prod.public.atl-paas.net/initials/MK-5.png?size=24&s=24",
      },
    },
    issuetype: {
      name: "Story",
      iconUrl: "https://acme.atlassian.net/rest/api/2/universal_avatar/view/type/issuetype/avatar/10315?size=medium",
    },
    customfield_10016: 3,
    priority: { name: "Medium" },
    labels: ["board"],
    created: "2026-09-01T00:00:00.000Z",
    updated: "2026-09-02T00:00:00.000Z",
  },
}

export const issueSearchPageOne = {
  isLast: false,
  nextPageToken: "page-2",
  issues: [issueSearchIssue],
}

export const issueSearchPageTwo = {
  isLast: true,
  issues: [
    {
      id: "10002",
      key: "PLAT-2",
      fields: {
        summary: "Inspect an issue",
        status: { id: "3", name: "In progress" },
        issuetype: { name: "Task" },
        priority: { name: "Low" },
        labels: [],
      },
    },
  ],
}

export const issueDetailFixture = {
  id: "10001",
  key: "PLAT-1",
  fields: {
    ...issueSearchIssue.fields,
    reporter: { displayName: "Ada Lovelace" },
    description: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Show the board columns." }],
        },
      ],
    },
  },
}

export function boardListResponse(page: 1 | 2 = 1) {
  return jsonResponse(200, page === 1 ? boardListPageOne : boardListPageTwo)
}

export function boardResponse() {
  return jsonResponse(200, boardFixture)
}

export function boardConfigurationResponse() {
  return jsonResponse(200, boardConfigurationFixture)
}

export function sprintListResponse() {
  return jsonResponse(200, sprintListFixture)
}

export function issueSearchResponse(page: 1 | 2 = 1) {
  return jsonResponse(200, page === 1 ? issueSearchPageOne : issueSearchPageTwo)
}

export function issueDetailResponse() {
  return jsonResponse(200, issueDetailFixture)
}

export const fieldListFixture = [
  { id: "summary", name: "Summary", schema: { type: "string" } },
  {
    id: "customfield_10016",
    name: "Story Points",
    schema: { type: "number", custom: "com.pyxis.greenhopper.jira:jsw-story-points" },
  },
  {
    id: "customfield_10020",
    name: "Sprint",
    schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" },
  },
]

export function fieldListResponse() {
  return jsonResponse(200, fieldListFixture)
}
