import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import { JiraIssueTypeIcon } from "./issue-type-icon"
import { JiraAvatar } from "./person"

export function JiraIssueList(props: {
  t: BocTranslator
  issues: readonly JiraBoardIssue[]
  selectedIssueKey?: string
  onSelectIssue: (issue: JiraBoardIssue, returnFocus: HTMLButtonElement) => void
  onOpenExternal: (url: string) => void
}) {
  return (
    <div
      data-boc-jira-issue-list
      class="min-w-[40rem] overflow-hidden rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-base"
    >
      <div
        aria-hidden="true"
        class="grid h-8 grid-cols-[9rem_minmax(14rem,1fr)_10rem_12rem] items-center gap-3 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted"
      >
        <span>{props.t("boc.jira.board.search.ticket")}</span>
        <span>{props.t("boc.jira.board.search.summary")}</span>
        <span>{props.t("boc.jira.board.inspector.status")}</span>
        <span>{props.t("boc.jira.board.filters.assignee")}</span>
      </div>
      <div role="list" aria-label={props.t("boc.jira.board.search.results")}>
        <For each={props.issues}>
          {(issue) => (
            <div role="listitem" class="border-b border-v2-border-border-muted last:border-b-0">
              <button
                type="button"
                data-boc-issue-row={issue.key}
                data-selected={props.selectedIssueKey === issue.key ? "" : undefined}
                aria-expanded={props.selectedIssueKey === issue.key}
                aria-controls="boc-jira-issue-inspector"
                class="grid min-h-10 w-full grid-cols-[9rem_minmax(14rem,1fr)_10rem_12rem] items-center gap-3 px-3 text-start text-[13px] leading-[var(--line-height-compact)] outline-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
                classList={{ "bg-v2-overlay-simple-overlay-pressed": props.selectedIssueKey === issue.key }}
                onClick={(event) => props.onSelectIssue(issue, event.currentTarget)}
              >
                <span class="flex min-w-0 items-center gap-2 text-v2-text-text-muted">
                  <JiraIssueTypeIcon issue={issue} />
                  <bdi
                    dir="ltr"
                    class="cursor-pointer truncate tabular-nums [font-weight:530] hover:text-v2-text-text-base hover:underline"
                    title={props.t("boc.jira.board.openIssue", { key: issue.key })}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      props.onOpenExternal(issue.url)
                    }}
                  >
                    {issue.key}
                  </bdi>
                </span>
                <span class="min-w-0">
                  <bdi dir="auto" class="block truncate text-v2-text-text-base">
                    {issue.summary}
                  </bdi>
                  <Show when={issue.priorityName}>
                    {(priority) => (
                      <bdi dir="auto" class="block truncate text-[12px] text-v2-text-text-faint">
                        {priority()}
                      </bdi>
                    )}
                  </Show>
                </span>
                <bdi dir="auto" class="truncate text-v2-text-text-muted">
                  {issue.statusName ?? "—"}
                </bdi>
                <span class="flex min-w-0 items-center gap-2 text-v2-text-text-muted">
                  <Show when={issue.assigneeName} fallback={props.t("boc.jira.board.inspector.unassigned")}>
                    {(assignee) => (
                      <>
                        <JiraAvatar fallback={assignee()} src={issue.assigneeAvatarUrl} />
                        <bdi dir="auto" class="truncate">
                          {assignee()}
                        </bdi>
                      </>
                    )}
                  </Show>
                </span>
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}
