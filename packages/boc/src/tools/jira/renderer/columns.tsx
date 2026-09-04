import { For } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import type { JiraColumnGroup } from "../domain/board"
import { JiraIssueCard } from "./card"

export function JiraBoardColumns(props: {
  t: BocTranslator
  groups: JiraColumnGroup[]
  selectedIssueKey?: string
  onSelectIssue: (issue: JiraBoardIssue) => void
}) {
  return (
    <div data-boc-board-columns class="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
      <For each={props.groups}>
        {(group) => (
          <section
            data-boc-board-column={group.column.id}
            class="flex min-h-0 w-[17rem] shrink-0 flex-col overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base"
          >
            <header class="flex items-baseline justify-between gap-2 border-l-2 border-v2-border-border-strong px-3 py-2">
              <h2 class="text-[13px] font-medium leading-[var(--line-height-compact)] text-v2-text-text-base">
                {group.column.id === "unmapped" ? props.t("boc.jira.board.column.other") : group.column.name}
              </h2>
              <span class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                {props.t("boc.jira.board.column.count", { count: group.issues.length })}
              </span>
            </header>
            <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              <For each={group.issues}>
                {(issue) => (
                  <JiraIssueCard
                    issue={issue}
                    selected={props.selectedIssueKey === issue.key}
                    onSelect={() => props.onSelectIssue(issue)}
                  />
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </div>
  )
}
