import type { JiraComment, JiraIssueDetail, JiraIssueUser } from "../domain/issue"
import type { JiraPullRequest } from "../domain/pull-request"
import type { JiraCollaborationApi } from "../renderer/resource"
import { adfToMarkdown } from "../domain/adf"
import { jiraAttachmentPreview } from "./attachment"

const formatting = adfToMarkdown({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "Dev Testing:", marks: [{ type: "strong" }] }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Registration checks passed " },
                { type: "emoji", attrs: { shortName: ":check_mark:" } },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "emoji", attrs: { shortName: ":information_source:" } },
                {
                  type: "text",
                  text: " Waiting for email setup",
                  marks: [{ type: "textColor", attrs: { color: "#ff991f" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
})

export const jiraUserFixtures: JiraIssueUser[] = [
  { accountId: "owner-1", displayName: "Platform developer", emailAddress: "platform@example.invalid" },
  { accountId: "owner-2", displayName: "Platform developer", emailAddress: "reviewer@example.invalid" },
  { accountId: "owner-3", displayName: "فريق التطوير — Platform", emailAddress: "team@example.invalid" },
]

export function jiraIssueFixture(key = "SHOP-617"): JiraIssueDetail {
  return {
    id: key,
    key,
    summary: "Keep product-gallery navigation consistent across layouts",
    assignee: jiraUserFixtures[0] ?? null,
    reporter: {
      accountId: "reporter",
      displayName: "Product team",
      avatarUrl:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Crect width='32' height='32' fill='%23608090'/%3E%3Ccircle cx='16' cy='12' r='6' fill='%23e0e8ef'/%3E%3Cpath d='M4 32a12 12 0 0 1 24 0' fill='%23e0e8ef'/%3E%3C/svg%3E",
    },
    parent: { key: "SHOP-610", summary: "Product experience", statusName: "In progress" },
    subtasks: [{ key: "SHOP-618", summary: "Keyboard navigation", statusName: "Done", statusCategory: "done" }],
    links: [
      {
        id: "1",
        relationship: "is blocked by",
        issue: { key: "SHOP-619", summary: "Gallery API response", statusName: "In progress" },
      },
    ],
    attachments: [
      { id: "100", filename: "gallery-layout.png", mimeType: "image/png", size: 24000 },
      { id: "101", filename: "test-results.pdf", mimeType: "application/pdf", size: 12000 },
    ],
    statusName: "In progress",
    issueTypeName: "Story",
    priorityName: "Medium",
    storyPoints: 5,
    labels: ["gallery", "accessibility"],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-12T10:00:00.000Z",
    description: `## Acceptance criteria\n\n- Preserve keyboard focus.\n- Support narrow layouts and mixed-direction content.\n\n> Review the [design notes](https://example.invalid/design).\n\n${formatting}`,
    url: `https://example.atlassian.net/browse/${key}`,
  }
}

export function jiraCommentFixtures(key = "SHOP-617"): JiraComment[] {
  return Array.from({ length: 45 }, (_, index) => ({
    id: `${key}-${index}`,
    author: jiraUserFixtures[index % jiraUserFixtures.length],
    body: `${key} discussion ${index + 1}.\n\n${index === 44 ? formatting : index % 3 === 0 ? "مرحبا — the keyboard flow keeps focus on `gallery-next`." : "The preview looks good. Please check **keyboard focus** and the narrow layout before rollout."}`,
    createdAt: new Date(Date.UTC(2026, 8, 10, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 10, index, index % 2 ? 10 : 0)).toISOString(),
  }))
}

export const jiraPullRequestFixtures: JiraPullRequest[] = (["OPEN", "OPEN", "MERGED", "CLOSED"] as const).map(
  (state, index) => ({
    number: 101 + index,
    title:
      index === 0
        ? "Keep product gallery navigation and keyboard focus consistent across narrow layouts"
        : "Gallery follow-up",
    url: `https://github.com/example/shop/pull/${101 + index}`,
    state,
    isDraft: index === 1,
    headRefName: `SHOP-617-gallery-navigation-${index}`,
    author: { login: "platform-team" },
    updatedAt: "2026-09-12T10:00:00.000Z",
    reviewDecision: index === 0 ? "APPROVED" : "",
  }),
)

export type JiraFixtureScenario =
  | "default"
  | "slow"
  | "empty"
  | "failed"
  | "rejected"
  | "unknown"
  | "stale"
  | "switching"

/** Fixture-only API. It has no network or desktop transport and cannot mutate Jira. */
export function createJiraFixtureApi(scenario: JiraFixtureScenario = "default") {
  const calls = {
    comments: 0,
    assignments: [] as { issueKey: string; accountId: string | null }[],
    searches: [] as string[],
    pullRequests: 0,
    cancellations: [] as string[],
    downloads: [] as string[],
    previews: [] as string[],
  }
  const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
  const api: JiraCollaborationApi = {
    async listBranches(input) {
      if (scenario === "failed") return { ok: false, category: "not-authenticated" }
      return {
        ok: true,
        branches:
          scenario === "empty"
            ? []
            : [
                {
                  name: `${input.issueKey}-gallery-navigation`,
                  url: `https://github.com/example/shop/tree/${input.issueKey}-gallery-navigation`,
                },
              ],
        truncated: false,
      }
    },
    async previewAttachment(input) {
      calls.previews.push(input.attachmentId)
      if (scenario === "slow") await wait(1200)
      if (scenario === "failed") return { ok: false, category: "permission" }
      return { ok: true, base64: jiraAttachmentPreview, mimeType: "image/png" }
    },
    async downloadAttachment(input) {
      calls.downloads.push(input.attachmentId)
      return scenario === "failed" ? { ok: false, category: "permission" } : { ok: true, saved: true }
    },
    async listComments(input) {
      calls.comments += 1
      if (scenario === "slow" || scenario === "switching") await wait(input.issueKey === "SHOP-617" ? 1_200 : 50)
      if (scenario === "failed" || (scenario === "stale" && calls.comments > 1))
        return { ok: false, category: "network" }
      const comments = scenario === "empty" ? [] : jiraCommentFixtures(input.issueKey).reverse()
      const page = comments.slice(input.startAt, input.startAt + 20).reverse()
      return {
        ok: true,
        page: {
          comments: page,
          startAt: input.startAt,
          maxResults: 20,
          total: comments.length,
          nextStartAt: input.startAt + page.length < comments.length ? input.startAt + page.length : null,
        },
      }
    },
    async searchAssignees(input) {
      calls.searches.push(input.query)
      if (scenario === "switching") await wait(input.query === "team" ? 600 : 70)
      if (scenario === "failed") return { ok: false, category: "network" }
      return {
        ok: true,
        users: jiraUserFixtures.filter((user) =>
          `${user.displayName} ${user.emailAddress}`.toLowerCase().includes(input.query.toLowerCase()),
        ),
      }
    },
    async assignIssue(input) {
      calls.assignments.push(input)
      await wait(400)
      if (scenario === "rejected") return { ok: false, category: "permission", outcome: "rejected" }
      if (scenario === "unknown")
        return { ok: false, category: "network", outcome: "unknown", issue: jiraIssueFixture(input.issueKey) }
      return {
        ok: true,
        issue: {
          ...jiraIssueFixture(input.issueKey),
          assignee: jiraUserFixtures.find((user) => user.accountId === input.accountId) ?? null,
        },
      }
    },
    async listPullRequests() {
      calls.pullRequests += 1
      if (scenario === "slow") await wait(2_000)
      if (scenario === "failed" || (scenario === "stale" && calls.pullRequests > 1))
        return { ok: false, category: "not-authenticated" }
      return {
        ok: true,
        requests: scenario === "empty" ? [] : jiraPullRequestFixtures,
        searchUrl: "https://github.com/example/shop/pulls?q=is%3Apr%20head%3ASHOP-617",
      }
    },
    async cancelIssueResourceRead(input) {
      calls.cancellations.push(input.requestId)
    },
  }
  return { api, calls }
}
