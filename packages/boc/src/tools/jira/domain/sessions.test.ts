import { expect, test } from "bun:test"
import { jiraSessionPrompt } from "./sessions"

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
