import { marked, type Token } from "marked"
import { Schema } from "effect"
import { adfToMarkdown, safeHttpUrl } from "./adf"
import { JiraCommentText } from "./issue"

type AdfMark = { type: string; attrs?: { href: string } }
export type JiraAdfNode = {
  type: string
  text?: string
  attrs?: Record<string, string | number>
  marks?: AdfMark[]
  content?: JiraAdfNode[]
}

const supported = new Set([
  "space",
  "paragraph",
  "text",
  "escape",
  "heading",
  "strong",
  "em",
  "del",
  "codespan",
  "code",
  "link",
  "blockquote",
  "list",
  "list_item",
  "br",
  "def",
])

/** Basic Markdown only. Unsupported authoring is rejected locally, never silently discarded. */
export function markdownToAdf(markdown: string) {
  if (!Schema.is(JiraCommentText)(markdown)) return { ok: false as const, reason: "length" as const }
  const tokens = marked.lexer(markdown, { gfm: true })
  const unsupported = marked.walkTokens(
    tokens,
    (token) =>
      !supported.has(token.type) ||
      (token.type === "list_item" && token.task) ||
      (token.type === "link" && !safeHttpUrl(token.href)),
  )
  if (unsupported.some(Boolean)) return { ok: false as const, reason: "unsupported" as const }
  const document = { type: "doc" as const, version: 1 as const, content: blocks(tokens) }
  return { ok: true as const, document, markdown: adfToMarkdown(document) ?? "" }
}

function blocks(tokens: Token[]): JiraAdfNode[] {
  return tokens.flatMap((token): JiraAdfNode[] => {
    if (token.type === "space" || token.type === "def") return []
    if (token.type === "heading")
      return [{ type: "heading", attrs: { level: token.depth }, content: inline(token.tokens ?? []) }]
    if (token.type === "code")
      return [
        {
          type: "codeBlock",
          ...(token.lang ? { attrs: { language: token.lang.split(/\s/)[0] } } : {}),
          content: text(token.text),
        },
      ]
    if (token.type === "blockquote") return [{ type: "blockquote", content: blocks(token.tokens ?? []) }]
    if (token.type === "list")
      return [
        {
          type: token.ordered ? "orderedList" : "bulletList",
          ...(token.ordered ? { attrs: { order: Number(token.start) || 1 } } : {}),
          content: token.items.map((item: { tokens: Token[] }) => ({ type: "listItem", content: blocks(item.tokens) })),
        },
      ]
    if (token.type === "paragraph" || token.type === "text")
      return [{ type: "paragraph", content: token.tokens ? inline(token.tokens) : text(token.text) }]
    return [{ type: "paragraph", content: text(token.raw) }]
  })
}

function inline(tokens: Token[], marks: AdfMark[] = []): JiraAdfNode[] {
  return tokens.flatMap((token): JiraAdfNode[] => {
    if (token.type === "br") return [{ type: "hardBreak" }]
    if (token.type === "codespan") return text(token.text, [{ type: "code" }])
    if (token.type === "strong" || token.type === "em" || token.type === "del") {
      return inline(token.tokens ?? [], [...marks, { type: token.type === "del" ? "strike" : token.type }])
    }
    if (token.type === "link")
      return inline(token.tokens ?? [], [...marks, { type: "link", attrs: { href: token.href } }])
    if (token.type === "text" || token.type === "escape") return text(token.text, marks)
    return text(token.raw, marks)
  })
}

function text(value: string, marks: AdfMark[] = []): JiraAdfNode[] {
  return value ? [{ type: "text", text: value, ...(marks.length ? { marks } : {}) }] : []
}
