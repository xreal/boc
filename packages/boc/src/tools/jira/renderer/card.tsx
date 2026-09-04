import type { JiraBoardIssue } from "../domain/board"

export function JiraIssueCard(props: {
  issue: JiraBoardIssue
  index: number
  selected: boolean
  onSelect: (returnFocus: HTMLButtonElement) => void
}) {
  const meta = () =>
    [props.issue.issueTypeName, props.issue.priorityName, props.issue.assigneeName].filter((value) => value)

  return (
    <button
      type="button"
      data-boc-issue-card={props.issue.key}
      data-boc-card-index={props.index}
      data-selected={props.selected ? "" : undefined}
      aria-expanded={props.selected}
      aria-controls="boc-jira-issue-inspector"
      class="flex w-full flex-col gap-1 rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-2.5 py-2 text-left text-[13px] leading-[var(--line-height-compact)] outline-none hover:border-v2-border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
      classList={{ "border-v2-border-border-strong": props.selected }}
      onClick={(event) => props.onSelect(event.currentTarget)}
    >
      <span class="font-medium text-v2-text-text-muted">{props.issue.key}</span>
      <span class="text-v2-text-text-base">{props.issue.summary}</span>
      <span class="flex flex-wrap gap-x-2 gap-y-0.5 text-v2-text-text-muted">{meta().join(" · ")}</span>
    </button>
  )
}
