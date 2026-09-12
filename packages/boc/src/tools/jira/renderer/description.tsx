import { JiraMarkdown } from "./markdown"

export function JiraIssueDescription(props: {
  markdown: string
  onOpenExternal: (url: string) => void
}) {
  return <JiraMarkdown {...props} />
}
