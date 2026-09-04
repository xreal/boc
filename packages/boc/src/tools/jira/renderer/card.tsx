import { Avatar } from "@opencode-ai/ui/avatar"
import { Show } from "solid-js"
import type { JiraBoardIssue } from "../domain/board"
import { jiraRelativeTime } from "./time"
import { jiraPriorityTone, jiraToneText } from "./tone"

export function JiraIssueCard(props: {
  issue: JiraBoardIssue
  locale: string
  index: number
  selected: boolean
  onSelect: (returnFocus: HTMLButtonElement) => void
}) {
  return (
    <button
      type="button"
      data-boc-issue-card={props.issue.key}
      data-boc-card-index={props.index}
      data-selected={props.selected ? "" : undefined}
      aria-expanded={props.selected}
      aria-controls="boc-jira-issue-inspector"
      class="flex w-full flex-col gap-1.5 rounded-[6px] bg-v2-background-bg-button-neutral px-3 py-2.5 text-left outline-none transition-[box-shadow,background-color] duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
      classList={{
        "shadow-[0_0_0_0.5px_var(--v2-border-border-base)] hover:shadow-[0_0_0_0.5px_var(--v2-border-border-strong)]":
          !props.selected,
        "shadow-[0_0_0_1px_var(--v2-border-border-focus)]": props.selected,
      }}
      onClick={(event) => props.onSelect(event.currentTarget)}
    >
      <span class="flex w-full items-center gap-2 text-[12px] leading-[var(--line-height-compact)] tabular-nums text-v2-text-text-muted">
        <span class="[font-weight:530]">{props.issue.key}</span>
        <Show when={props.issue.priorityName}>
          {(priority) => (
            <span class={`ml-auto truncate ${jiraToneText[jiraPriorityTone(priority())]}`}>{priority()}</span>
          )}
        </Show>
      </span>
      <span class="line-clamp-3 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base">
        {props.issue.summary}
      </span>
      <span class="flex w-full items-center gap-2 text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
        <Show when={props.issue.issueTypeName}>{(type) => <span class="truncate">{type()}</span>}</Show>
        <span class="ml-auto flex shrink-0 items-center gap-2">
          <Show when={jiraRelativeTime(props.issue.updatedAt, props.locale)}>
            {(updated) => <span class="text-v2-text-text-faint">{updated()}</span>}
          </Show>
          <Show when={props.issue.assigneeName}>
            {(assignee) => (
              <>
                <Avatar size="small" fallback={assignee()} />
                <span class="sr-only">{assignee()}</span>
              </>
            )}
          </Show>
        </span>
      </span>
    </button>
  )
}
