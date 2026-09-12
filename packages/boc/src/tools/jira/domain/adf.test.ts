import { describe, expect, test } from "bun:test"
import { adfToMarkdown, adfToPlainText, safeHttpUrl } from "./adf"

const doc = (...content: unknown[]) => ({ type: "doc", version: 1, content })

describe("adfToMarkdown", () => {
  test("resolves common emoji short names in descriptions, comments, and plain text", () => {
    const value = doc({
      type: "paragraph",
      content: [
        { type: "emoji", attrs: { shortName: ":thumbsup:" } },
        { type: "emoji", attrs: { shortName: ":tada:", text: ":tada:" } },
        { type: "emoji", attrs: { shortName: ":white_check_mark:" } },
        { type: "emoji", attrs: { shortName: ":check_mark:" } },
        { type: "emoji", attrs: { shortName: ":warning:" } },
        { type: "emoji", attrs: { shortName: ":rocket:" } },
        { type: "emoji", attrs: { shortName: ":thumbsup::skin-tone-4:" } },
        { type: "emoji", attrs: { shortName: ":thumbsup:", text: "👍🏿" } },
      ],
    })
    expect(adfToMarkdown(value)).toBe("👍🎉✅✔️⚠️🚀👍🏽👍🏿")
    expect(adfToPlainText(value)).toBe("👍🎉✅✔️⚠️🚀👍🏽👍🏿")
  })

  test("converts prose while preserving custom emoji labels and code", () => {
    const value = doc({
      type: "paragraph",
      content: [
        { type: "emoji", attrs: { shortName: ":custom_team_logo:", id: "custom-id" } },
        { type: "text", text: " :rocket: " },
        { type: "text", text: ":thumbsup:", marks: [{ type: "code" }] },
        { type: "emoji", attrs: { text: "", shortName: ":SMILE:" } },
        { type: "emoji", attrs: { text: 123, shortName: null } },
      ],
    })
    expect(adfToMarkdown(value)).toBe(":custom\\_team\\_logo: 🚀 `:thumbsup:`😄")
    expect(adfToPlainText(value)).toBe(":custom_team_logo: :rocket: :thumbsup:😄")
    expect(adfToMarkdown(doc({ type: "emoji", attrs: { shortName: ":+1:" } }))).toBe("👍")
  })

  test("keeps headings, emphasis, lists, and code", () => {
    expect(
      adfToMarkdown(
        doc(
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Setup" }],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Run " },
              { type: "text", text: "bun test", marks: [{ type: "code" }] },
              { type: "text", text: " then " },
              { type: "text", text: "ship", marks: [{ type: "strong" }] },
              { type: "text", text: "." },
            ],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }],
              },
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Two" }] }],
              },
            ],
          },
          {
            type: "codeBlock",
            attrs: { language: "ts" },
            content: [{ type: "text", text: "const ok = true" }],
          },
        ),
      ),
    ).toBe(`## Setup

Run \`bun test\` then **ship**.

- One
- Two

\`\`\`ts
const ok = true
\`\`\``)
  })

  test("keeps http links and drops javascript hrefs", () => {
    expect(
      adfToMarkdown(
        doc({
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Docs",
              marks: [{ type: "link", attrs: { href: "https://acme.atlassian.net/wiki" } }],
            },
            { type: "text", text: " or " },
            {
              type: "text",
              text: "nope",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        }),
      ),
    ).toBe("[Docs](https://acme.atlassian.net/wiki) or nope")
    expect(safeHttpUrl("javascript:alert(1)")).toBeUndefined()
  })

  test("leaves already-plain descriptions alone", () => {
    expect(adfToMarkdown("Already plain")).toBe("Already plain")
    expect(adfToMarkdown("  ")).toBeUndefined()
  })

  test("nests lists the way ADF listItem children work", () => {
    expect(
      adfToMarkdown(
        doc({
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Parent" }] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        { type: "paragraph", content: [{ type: "text", text: "Child" }] },
                        {
                          type: "bulletList",
                          content: [
                            {
                              type: "listItem",
                              content: [{ type: "paragraph", content: [{ type: "text", text: "Grandchild" }] }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    ).toBe(`- Parent
  - Child
    - Grandchild`)
  })

  test("renders table cells from block paragraphs", () => {
    expect(
      adfToMarkdown(
        doc({
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Col A" }] }],
                },
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Col B" }] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Row one, cell one" }] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Row one, cell two" }] }],
                },
              ],
            },
          ],
        }),
      ),
    ).toBe(`| Col A | Col B |
| --- | --- |
| Row one, cell one | Row one, cell two |`)
  })

  test("renders external images and keeps a label for Jira file media", () => {
    expect(
      adfToMarkdown(
        doc({
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [
            {
              type: "media",
              attrs: {
                type: "external",
                url: "https://acme.atlassian.net/images/moon.jpeg",
                alt: "moon.jpeg",
              },
            },
          ],
        }),
      ),
    ).toBe("![moon.jpeg](https://acme.atlassian.net/images/moon.jpeg)")
    expect(
      adfToMarkdown(
        doc({
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            {
              type: "mediaInline",
              attrs: {
                type: "image",
                id: "4478e39c-cf9b-41d1-ba92-68589487cd75",
                collection: "contentId-1",
                alt: "icon.png",
                url: "https://acme.atlassian.net/images/icon.png",
              },
            },
            { type: "text", text: "." },
          ],
        }),
      ),
    ).toBe("See ![icon.png](https://acme.atlassian.net/images/icon.png).")
    expect(
      adfToMarkdown(
        doc({
          type: "mediaSingle",
          content: [
            {
              type: "media",
              attrs: {
                id: "4478e39c-cf9b-41d1-ba92-68589487cd75",
                type: "file",
                collection: "MediaServicesSample",
                alt: "screenshot.png",
              },
            },
          ],
        }),
      ),
    ).toBe("*screenshot.png*")
  })
})

describe("adfToPlainText", () => {
  test("flattens Atlassian document text without HTML", () => {
    expect(
      adfToPlainText({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " },
              { type: "text", text: "board" },
            ],
          },
          { type: "paragraph", content: [{ type: "text", text: "Second line" }] },
        ],
      }),
    ).toBe("Hello board\n\nSecond line")
    expect(adfToPlainText("Already plain")).toBe("Already plain")
    expect(adfToPlainText(null)).toBeUndefined()
  })
})
