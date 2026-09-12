import { Marked, Renderer } from "marked"
import { safeHttpUrl } from "../domain/adf"
import { replaceEmojiShortcodes } from "../domain/emoji"

const markdownRenderer = new Renderer()
const parser = new Marked({
  gfm: true,
  walkTokens(token) {
    if (token.type === "text") token.text = replaceEmojiShortcodes(token.text)
  },
  renderer: {
    html({ text }) {
      // Only the exact color-span syntax emitted by the ADF converter is supported.
      if (/^<span style="color:#[\da-f]{6}">$/i.test(text) || text === "</span>") return text
      return ""
    },
    text(token) {
      if ("tokens" in token && token.tokens) return false
      return markdownRenderer.text
        .call(this, token)
        .replace(/[✔ℹ]\uFE0F?/gu, (emoji) =>
          emoji.startsWith("✔")
            ? '<span data-jira-emoji="check-mark" role="img" aria-label="✔️">✓</span>'
            : '<span data-jira-emoji="information" role="img" aria-label="ℹ️">ℹ︎</span>',
        )
    },
    image({ href, title, text }) {
      const url = safeHttpUrl(href)
      if (!url) return escapeHtml(text)
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ""
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttr} />`
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const url = safeHttpUrl(href)
      if (!url) return text
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ""
      return `<a href="${escapeHtml(url)}"${titleAttr} target="_blank" rel="noreferrer noopener">${text}</a>`
    },
  },
})

export function renderJiraMarkdown(markdown: string) {
  return parser.parse(markdown, { async: false }) as string
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
