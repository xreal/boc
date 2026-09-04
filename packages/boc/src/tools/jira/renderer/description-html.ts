import { Marked } from "marked"
import { safeHttpUrl } from "../domain/adf"

const parser = new Marked({
  gfm: true,
  renderer: {
    html() {
      return ""
    },
    image({ href, title, text }) {
      const url = safeHttpUrl(href)
      if (!url) return text
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : ""
      return `<img src="${escapeHtml(url)}" alt="${escapeHtml(text)}"${titleAttr} />`
    },
    link({ href, title, text }) {
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
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
