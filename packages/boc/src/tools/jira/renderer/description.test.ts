import { describe, expect, test } from "bun:test"
import { renderJiraMarkdown } from "./description-html"
import { adfToMarkdown } from "../domain/adf"

describe("renderJiraMarkdown", () => {
  test("converts emoji shortcodes in prose without changing code or link destinations", () => {
    const html = renderJiraMarkdown(
      "**:thumbsup:** :check_mark: :custom_team_logo: `:rocket:`\n\n```\n:thumbsup:\n```\n\n[Docs :tada:](https://example.invalid/:rocket:)",
    )
    expect(html).toContain("<strong>👍</strong>")
    expect(html).toContain('data-jira-emoji="check-mark"')
    expect(html).toContain(":custom_team_logo:")
    expect(html).toContain("<code>:rocket:</code>")
    expect(html).toContain("<pre><code>:thumbsup:")
    expect(html).toContain('href="https://example.invalid/:rocket:"')
    expect(html).toContain("Docs 🎉</a>")
  })

  test("preserves Jira annotation colors and renders stable status emoji artwork", () => {
    const markdown = adfToMarkdown({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Dev Testing:", marks: [{ type: "strong" }] },
            { type: "emoji", attrs: { shortName: ":check_mark:" } },
            { type: "emoji", attrs: { shortName: ":information_source:" } },
            {
              type: "text",
              text: "Wait for email setup",
              marks: [{ type: "textColor", attrs: { color: "#ff991f" } }, { type: "strong" }],
            },
          ],
        },
      ],
    })
    const html = renderJiraMarkdown(markdown ?? "")
    expect(html).toContain("<strong>Dev Testing:</strong>")
    expect(html).toContain('<span style="color:#ff991f"><strong>Wait for email setup</strong></span>')
    expect(html).toContain('data-jira-emoji="check-mark"')
    expect(html).toContain('data-jira-emoji="information"')
    expect(renderJiraMarkdown("`✔️ ℹ️`")).toContain("<code>✔️ ℹ️</code>")
  })

  test("renders emphasis and lists", () => {
    expect(renderJiraMarkdown("Run **ship**.\n\n- One")).toContain("<strong>ship</strong>")
    expect(renderJiraMarkdown("Run **ship**.\n\n- One")).toContain("<li>One</li>")
  })

  test("does not render raw HTML or javascript links", () => {
    expect(renderJiraMarkdown('<span style="color:#ff991f" onclick="alert(1)">text</span>')).not.toContain("onclick")
    expect(renderJiraMarkdown('<span style="color:expression(alert(1))">text</span>')).not.toContain("expression")
    expect(renderJiraMarkdown('[<img src=x onerror="alert(1)">](https://example.invalid)')).not.toContain("<img")
    expect(renderJiraMarkdown("[**Docs**](https://example.invalid)")).toContain("<strong>Docs</strong>")
    expect(renderJiraMarkdown("<script>alert(1)</script>")).not.toContain("<script>")
    expect(renderJiraMarkdown("[x](javascript:alert(1))")).not.toContain("javascript:")
    expect(renderJiraMarkdown("[Docs](https://acme.atlassian.net/wiki)")).toContain(
      'href="https://acme.atlassian.net/wiki"',
    )
    expect(renderJiraMarkdown("![moon](https://acme.atlassian.net/images/moon.jpeg)")).toContain(
      'src="https://acme.atlassian.net/images/moon.jpeg"',
    )
    expect(renderJiraMarkdown("![x](javascript:alert(1))")).not.toContain("javascript:")
  })
})
