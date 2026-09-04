export function adfToMarkdown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return
    return trimmed
  }
  const markdown = renderBlock(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!markdown) return
  return markdown
}

export function adfToPlainText(value: unknown): string | undefined {
  const text = collectPlain(value).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (!text) return
  return text
}

function renderBlock(value: unknown, tight = false): string {
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) return value.map((node) => renderBlock(node, tight)).join("")
  if (!isRecord(value)) return ""
  const type = value.type
  const attrs = isRecord(value.attrs) ? value.attrs : undefined
  const content = Array.isArray(value.content) ? value.content : []

  if (type === "doc") return renderBlock(content)
  if (type === "paragraph") {
    const inner = renderInline(content)
    if (tight) return inner
    return inner ? `${inner}\n\n` : "\n"
  }
  if (type === "heading") {
    const level = headingLevel(attrs?.level)
    const inner = renderInline(content)
    if (!inner) return ""
    return `${"#".repeat(level)} ${inner}\n\n`
  }
  if (type === "blockquote" || type === "panel") {
    const inner = renderBlock(content).trim()
    if (!inner) return ""
    return `${inner.split("\n").map((line) => `> ${line}`).join("\n")}\n\n`
  }
  if (type === "codeBlock") {
    const language = text(attrs?.language) ?? ""
    const code = collectText(content).replace(/\n$/, "")
    return `\`\`\`${language}\n${code}\n\`\`\`\n\n`
  }
  if (type === "bulletList") return `${renderList(content, false)}\n\n`
  if (type === "orderedList") return `${renderList(content, true, finitePositive(attrs?.order) ?? 1)}\n\n`
  if (type === "taskList") return `${renderTaskList(content)}\n\n`
  if (type === "listItem") return renderListItem(content)
  if (type === "taskItem") {
    const checked = text(attrs?.state)?.toUpperCase() === "DONE"
    const inner = renderInline(content)
    return `${checked ? "- [x] " : "- [ ] "}${inner}`
  }
  if (type === "rule") return "---\n\n"
  if (type === "table") return `${renderTable(content)}\n`
  if (type === "expand" || type === "nestedExpand") {
    const title = text(attrs?.title)
    const inner = renderBlock(content).trim()
    if (title && inner) return `**${escapeMarkdown(title)}**\n\n${inner}\n\n`
    if (title) return `**${escapeMarkdown(title)}**\n\n`
    return inner ? `${inner}\n\n` : ""
  }
  if (type === "layoutSection" || type === "layoutColumn" || type === "mediaSingle" || type === "mediaGroup") {
    return renderBlock(content, tight)
  }
  if (type === "caption") {
    const inner = renderInline(content)
    return inner ? `*${inner}*\n\n` : ""
  }
  if (type === "media" || type === "image") return mediaMarkdown(value, false)
  if (type === "mediaInline") return mediaMarkdown(value, true)
  if (type === "hardBreak") return "\n"
  if (type === "mention") return mention(attrs)
  if (type === "emoji") return text(attrs?.text) ?? text(attrs?.shortName) ?? ""
  if (type === "inlineCard" || type === "blockCard" || type === "embedCard") return card(attrs)
  if (type === "status") {
    const label = text(attrs?.text)
    return label ? `**${escapeMarkdown(label)}**` : ""
  }
  if (type === "date") return dateText(attrs)
  if (typeof value.text === "string") return applyMarks(value.text, value.marks)
  return renderBlock(content, tight)
}

function renderInline(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) return value.map(renderInline).join("")
  if (!isRecord(value)) return ""
  if (value.type === "hardBreak") return "  \n"
  if (value.type === "mention") return mention(isRecord(value.attrs) ? value.attrs : undefined)
  if (value.type === "emoji") {
    const attrs = isRecord(value.attrs) ? value.attrs : undefined
    return text(attrs?.text) ?? text(attrs?.shortName) ?? ""
  }
  if (value.type === "inlineCard") return card(isRecord(value.attrs) ? value.attrs : undefined)
  if (value.type === "mediaInline" || value.type === "image" || value.type === "media") {
    return mediaMarkdown(value, true)
  }
  if (typeof value.text === "string") return applyMarks(value.text, value.marks)
  if (Array.isArray(value.content)) return renderInline(value.content)
  return ""
}

function renderList(items: unknown[], ordered: boolean, start = 1) {
  return items
    .flatMap((item, index) => {
      if (!isRecord(item)) return []
      const body = renderBlock(item, true).trim()
      if (!body) return []
      const lines = body.split("\n")
      const marker = ordered ? `${start + index}. ` : "- "
      const indent = " ".repeat(marker.length)
      return [marker + lines[0]!, ...lines.slice(1).map((line) => (line ? `${indent}${line}` : ""))]
    })
    .join("\n")
}

function renderListItem(content: unknown[]) {
  return content
    .map((child, index) => renderBlock(child, index === 0).replace(/\n+$/, ""))
    .filter(Boolean)
    .join("\n")
}

function renderTaskList(items: unknown[]): string {
  return items
    .flatMap((item) => {
      if (!isRecord(item)) return []
      if (item.type === "taskList") {
        const nested = renderTaskList(Array.isArray(item.content) ? item.content : [])
        return nested.split("\n").map((line) => (line ? `  ${line}` : ""))
      }
      const body = renderBlock(item, true).trim()
      return body ? [body] : []
    })
    .join("\n")
}

function renderTable(rows: unknown[]) {
  const cells = rows.flatMap((row) => {
    if (!isRecord(row) || !Array.isArray(row.content)) return []
    return [
      row.content.map((cell) => {
        if (!isRecord(cell)) return ""
        return renderTableCell(cell)
      }),
    ]
  })
  if (cells.length === 0) return ""
  const width = Math.max(...cells.map((row) => row.length))
  const padded = cells.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""))
  const header = padded[0] ?? []
  const divider = header.map(() => "---")
  const body = padded.slice(1)
  return [
    `| ${header.join(" | ")} |`,
    `| ${divider.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
    "",
  ].join("\n")
}

function renderTableCell(cell: Record<string, unknown>) {
  const content = Array.isArray(cell.content) ? cell.content : []
  return content
    .map((child) => renderBlock(child, true).trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\|/g, "\\|")
    .replace(/\n+/g, " ")
}

function mediaMarkdown(node: Record<string, unknown>, inline: boolean) {
  const attrs = isRecord(node.attrs) ? node.attrs : undefined
  const marks = Array.isArray(node.marks) ? node.marks.filter(isRecord) : []
  const alt = text(attrs?.alt) ?? text(attrs?.title) ?? mediaFileName(attrs) ?? "Image"
  const url = safeHttpUrl(text(attrs?.url) ?? text(attrs?.src)) ?? linkHref(marks)
  if (url) {
    const image = `![${escapeMarkdown(alt)}](${url})`
    return inline ? image : `${image}\n\n`
  }
  const label = `*${escapeMarkdown(alt)}*`
  return inline ? label : `${label}\n\n`
}

function mediaFileName(attrs: Record<string, unknown> | undefined) {
  if (!attrs) return
  if (typeof attrs.__fileName === "string") return text(attrs.__fileName)
}

function applyMarks(raw: string, marks: unknown) {
  const list = Array.isArray(marks) ? marks.filter(isRecord) : []
  if (list.some((mark) => mark.type === "code")) return `\`${raw.replace(/`/g, "\\`")}\``
  let result = escapeMarkdown(raw)
  if (list.some((mark) => mark.type === "strong")) result = `**${result}**`
  if (list.some((mark) => mark.type === "em")) result = `*${result}*`
  if (list.some((mark) => mark.type === "strike")) result = `~~${result}~~`
  const href = linkHref(list)
  if (href) result = `[${result}](${href})`
  return result
}

function linkHref(marks: Record<string, unknown>[]) {
  for (const mark of marks) {
    if (mark.type !== "link") continue
    const attrs = isRecord(mark.attrs) ? mark.attrs : undefined
    const href = safeHttpUrl(text(attrs?.href))
    if (href) return href
  }
}

function mention(attrs: Record<string, unknown> | undefined) {
  const name = text(attrs?.text) ?? text(attrs?.id)
  if (!name) return ""
  return `@${name.replace(/^@/, "")}`
}

function card(attrs: Record<string, unknown> | undefined) {
  const url = safeHttpUrl(text(attrs?.url))
  if (!url) return ""
  return `[${url}](${url})`
}

function dateText(attrs: Record<string, unknown> | undefined) {
  const timestamp = finitePositive(attrs?.timestamp)
  if (!timestamp) return text(attrs?.text) ?? ""
  return new Date(timestamp).toISOString().slice(0, 10)
}

function collectPlain(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) return value.map(collectPlain).join("")
  if (!isRecord(value)) return ""
  if (typeof value.text === "string") return value.text
  const inner = Array.isArray(value.content) ? value.content.map(collectPlain).join("") : ""
  if (value.type === "paragraph" || value.type === "heading" || value.type === "blockquote") return inner ? `${inner}\n\n` : ""
  if (value.type === "listItem") return inner ? `${inner}\n` : ""
  if (value.type === "hardBreak") return "\n"
  return inner
}

function headingLevel(value: unknown) {
  const level = finitePositive(value)
  if (!level) return 2
  return Math.min(6, Math.max(1, Math.floor(level)))
}

function collectText(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return ""
  if (Array.isArray(value)) return value.map(collectText).join("")
  if (!isRecord(value)) return ""
  if (typeof value.text === "string") return value.text
  if (value.type === "hardBreak") return "\n"
  return Array.isArray(value.content) ? value.content.map(collectText).join("") : ""
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_\[\]~])/g, "\\$&")
}

export function safeHttpUrl(value: string | undefined) {
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") return
  if (url.username !== "" || url.password !== "") return
  return url.toString()
}

function finitePositive(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  if (typeof value !== "string") return
  const trimmed = value.trim()
  if (!trimmed) return
  return trimmed
}
