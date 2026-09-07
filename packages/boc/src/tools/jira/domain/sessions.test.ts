import { expect, test } from "bun:test"
import {
  defaultJiraSessionInstructions,
  jiraSessionModel,
  jiraSessionPrompt,
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

test("uses the shipped difficulty models for legacy prompt defaults", () => {
  expect(normalizeJiraSessionInstructions({ before: "Before", after: "After" })).toEqual({
    ...defaultJiraSessionInstructions,
    before: "Before",
    after: "After",
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
