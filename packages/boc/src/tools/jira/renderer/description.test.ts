import { describe, expect, test } from "bun:test"
import { renderJiraMarkdown } from "./description-html"

describe("renderJiraMarkdown", () => {
  test("renders emphasis and lists", () => {
    expect(renderJiraMarkdown("Run **ship**.\n\n- One")).toContain("<strong>ship</strong>")
    expect(renderJiraMarkdown("Run **ship**.\n\n- One")).toContain("<li>One</li>")
  })

  test("does not render raw HTML or javascript links", () => {
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
