import { renderJiraMarkdown } from "./description-html"
import "./description.css"

export function JiraMarkdown(props: { markdown: string; onOpenExternal: (url: string) => void }) {
  return (
    <div
      data-boc-jira-markdown
      innerHTML={renderJiraMarkdown(props.markdown)}
      onClick={(event) => {
        const link = event.target instanceof Element ? event.target.closest("a") : undefined
        if (!link?.href) return
        event.preventDefault()
        event.stopPropagation()
        if (/^#jira-attachment-\d+$/.test(link.getAttribute("href") ?? "")) {
          const id = link.hash.slice("#jira-attachment-".length)
          const target = event.currentTarget
            .closest("[data-boc-issue-inspector]")
            ?.querySelector<HTMLButtonElement>(`[data-jira-attachment="${id}"]`)
          target?.scrollIntoView({ block: "nearest" })
          target?.focus({ preventScroll: true })
          target?.click()
          return
        }
        props.onOpenExternal(link.href)
      }}
    />
  )
}
