import { expect, test } from "bun:test"
import {
  defaultJiraSessionInstructions,
  jiraSessionModel,
  jiraSessionPrompt,
  jiraPullRequestReviewPrompt,
  normalizeJiraSessionInstructions,
} from "./sessions"

test("prepares the ticket with Markdown intact between optional instructions", () => {
  expect(
    jiraSessionPrompt(
      {
        key: "APP-42",
        summary: "Fix checkout",
        url: "https://example.atlassian.net/browse/APP-42",
        description: "## Acceptance criteria\n\n- Keep **saved carts** intact.\n- Support `guest` checkout.",
      },
      "  Investigate first.  ",
      "  Run the checkout tests.  ",
    ),
  ).toBe(
    "Investigate first.\n\nAPP-42: Fix checkout\n\nhttps://example.atlassian.net/browse/APP-42\n\n## Acceptance criteria\n\n- Keep **saved carts** intact.\n- Support `guest` checkout.\n\nRun the checkout tests.",
  )
})

test("handles tickets without a description or optional instructions", () => {
  expect(
    jiraSessionPrompt(
      { key: "APP-42", summary: "Fix checkout", url: "https://example.atlassian.net/browse/APP-42" },
      " ",
      "",
    ),
  ).toBe("APP-42: Fix checkout\n\nhttps://example.atlassian.net/browse/APP-42")
})

test("prepares a pull request review from the saved template and linked ticket", () => {
  expect(
    jiraPullRequestReviewPrompt(
      {
        key: "APP-42",
        summary: "Fix checkout",
        url: "https://example.atlassian.net/browse/APP-42",
        description: "Keep saved carts intact.",
      },
      {
        number: 17,
        title: "Preserve saved carts",
        url: "https://github.com/example/shop/pull/17",
        headRefName: "APP-42-saved-carts",
      },
      "  Find actionable regressions only.  ",
    ),
  ).toBe(
    "Find actionable regressions only.\n\n## Pull request\n\n#17: Preserve saved carts\n\nhttps://github.com/example/shop/pull/17\n\nSource branch: APP-42-saved-carts\n\n## Jira ticket\n\nAPP-42: Fix checkout\n\nhttps://example.atlassian.net/browse/APP-42\n\n## Ticket description\n\nKeep saved carts intact.",
  )
})

test("keeps the suggested review concise and read-only", () => {
  expect(defaultJiraSessionInstructions.review).toContain("Write in plain, easy-to-understand English.")
  expect(defaultJiraSessionInstructions.review).toContain("Lead with findings and skip the preamble.")
  expect(defaultJiraSessionInstructions.review).toContain("Keep each finding brief")
  expect(defaultJiraSessionInstructions.review).toContain(
    "For a complex finding, add the smallest useful visual beside it",
  )
  expect(defaultJiraSessionInstructions.review).toContain("Skip visuals when plain text is clearer.")
  expect(defaultJiraSessionInstructions.review).toEndWith("Do not modify code, commit, or push!")
})

test("uses the shipped difficulty models for legacy prompt defaults", () => {
  expect(normalizeJiraSessionInstructions({ before: "Before", after: "After" })).toEqual({
    ...defaultJiraSessionInstructions,
    before: "Before",
    after: "After",
  })
})

test("adds the suggested review prompt to previously saved session settings", () => {
  const previous = {
    before: "Custom before",
    after: defaultJiraSessionInstructions.after,
    modelDefaultsVersion: defaultJiraSessionInstructions.modelDefaultsVersion,
    models: {
      ...defaultJiraSessionInstructions.models,
      default: { model: "custom/reviewer", preserveOnUpdate: true },
    },
  }
  expect(normalizeJiraSessionInstructions(previous)).toEqual({
    ...previous,
    review: defaultJiraSessionInstructions.review,
  })
})

test("updates unprotected model defaults and retains protected models", () => {
  const normalized = normalizeJiraSessionInstructions({
    ...defaultJiraSessionInstructions,
    modelDefaultsVersion: 0,
    models: {
      low: { model: "custom/low#high", preserveOnUpdate: true },
      default: { model: "custom/default", preserveOnUpdate: false },
      high: { model: "custom/high", preserveOnUpdate: true },
    },
  })

  expect(normalized.models).toEqual({
    low: { model: "custom/low#high", preserveOnUpdate: true },
    default: defaultJiraSessionInstructions.models.default,
    high: { model: "custom/high", preserveOnUpdate: true },
  })
})

test("prepares a composer model from a configured model reference", () => {
  expect(jiraSessionModel("github-copilot/gpt-5.6-luna#xhigh")).toEqual({
    providerID: "github-copilot",
    modelID: "gpt-5.6-luna",
    variant: "xhigh",
  })
})
