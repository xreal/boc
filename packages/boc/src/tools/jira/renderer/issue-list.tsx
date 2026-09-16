import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import { JiraIssueTypeIcon } from "./issue-type-icon"
import { JiraAvatar } from "./person"
import { jiraRelativeTime } from "./time"

export function JiraIssueList(props: {
  t: BocTranslator
  locale: string
  issues: readonly JiraBoardIssue[]
  selectedIssueKey?: string
  onSelectIssue: (issue: JiraBoardIssue, returnFocus: HTMLButtonElement) => void
  onOpenExternal: (url: string) => void
}) {
  return (
    <div
      data-boc-jira-issue-list
      class="min-w-[41rem] overflow-hidden rounded-[8px] border border-v2-border-border-muted bg-v2-background-bg-base"
    >
      <div
        aria-hidden="true"
        class="grid h-8 grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem] items-center gap-3 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted lg:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem] xl:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem_7rem] 2xl:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem_7rem_7rem]"
      >
        <span>{props.t("boc.jira.board.search.ticket")}</span>
        <span>{props.t("boc.jira.board.search.summary")}</span>
        <span>{props.t("boc.jira.board.inspector.status")}</span>
        <span>{props.t("boc.jira.board.filters.assignee")}</span>
        <span class="truncate" title={props.t("boc.jira.ticket.storyPoints.label")}>
          {props.t("boc.jira.ticket.storyPoints.label")}
        </span>
        <span class="hidden lg:block">{props.t("boc.jira.board.search.creator")}</span>
        <span class="hidden 2xl:block">{props.t("boc.jira.board.inspector.created")}</span>
        <span class="hidden xl:block">{props.t("boc.jira.board.inspector.updated")}</span>
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
                class="grid min-h-10 w-full grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem] items-center gap-3 px-3 text-start text-[13px] leading-[var(--line-height-compact)] outline-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus lg:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem] xl:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem_7rem] 2xl:grid-cols-[7rem_minmax(10rem,1fr)_7rem_8rem_4rem_9rem_7rem_7rem]"
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
                <span class="truncate tabular-nums text-v2-text-text-muted">{issue.storyPoints ?? "—"}</span>
                <span class="hidden min-w-0 items-center gap-2 text-v2-text-text-muted lg:flex">
                  <Show when={issue.creatorName} fallback="—">
                    {(creator) => (
                      <>
                        <JiraAvatar fallback={creator()} src={issue.creatorAvatarUrl} />
                        <bdi dir="auto" class="truncate">
                          {creator()}
                        </bdi>
                      </>
                    )}
                  </Show>
                </span>
                <span class="hidden truncate text-v2-text-text-muted 2xl:block">
                  <IssueTimestamp value={issue.createdAt} locale={props.locale} />
                </span>
                <span class="hidden truncate text-v2-text-text-muted xl:block">
                  <IssueTimestamp value={issue.updatedAt} locale={props.locale} />
                </span>
              </button>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

function IssueTimestamp(props: { value?: string; locale: string }) {
  return (
    <time dateTime={props.value} title={props.value ? new Date(props.value).toLocaleString(props.locale) : undefined}>
      {jiraRelativeTime(props.value, props.locale) ?? "—"}
    </time>
  )
}
