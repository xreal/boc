import { renderJiraMarkdown } from "./description-html"
import "./description.css"

export function JiraIssueDescription(props: {
  markdown: string
  onOpenExternal: (url: string) => void
}) {
  return (
    <div
      data-boc-jira-markdown
      innerHTML={renderJiraMarkdown(props.markdown)}
      onClick={(event) => {
        const link = event.target instanceof Element ? event.target.closest("a") : undefined
        if (!link?.href) return
        event.preventDefault()
        event.stopPropagation()
        props.onOpenExternal(link.href)
      }}
    />
  )
}
