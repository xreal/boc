import { Badge } from "@opencode/ui/badge"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import type { JiraColumnGroup } from "../domain/board"
import { JiraIssueCard } from "./card"
import { jiraBoardFocusTarget } from "./focus"

export function JiraBoardColumns(props: {
  t: BocTranslator
  locale: string
  groups: JiraColumnGroup[]
  selectedIssueKey?: string
  sessionCounts: Readonly<Record<string, number>>
  deployedHosts?: (issueKey: string) => readonly string[] | undefined
  sessionActionsDisabled: boolean
  onNewChat: (issue: JiraBoardIssue) => Promise<void>
  onStartWork: (issue: JiraBoardIssue) => Promise<void>
  onSelectIssue: (issue: JiraBoardIssue, returnFocus: HTMLButtonElement) => void
  onOpenExternal: (url: string) => void
}) {
  const moveFocus = (event: KeyboardEvent & { currentTarget: HTMLDivElement; target: Element }) => {
    if (!(event.target instanceof HTMLElement)) return
    const column = event.target.closest<HTMLElement>("[data-boc-column-index]")
    if (!column) return
    const card = event.target.closest<HTMLElement>("[data-boc-card-index]")
    const target = jiraBoardFocusTarget(
      props.groups,
      Number(column.dataset.bocColumnIndex),
      card ? Number(card.dataset.bocCardIndex) : undefined,
      event.key,
    )
    if (!target) return
    const targetColumn = event.currentTarget.querySelector<HTMLElement>(
      `[data-boc-column-index="${target.columnIndex}"]`,
    )
    const targetElement =
      target.cardIndex === undefined
        ? targetColumn
        : targetColumn?.querySelector<HTMLElement>(`[data-boc-card-index="${target.cardIndex}"]`)
    if (!targetElement) return
    event.preventDefault()
    targetElement.focus()
  }

  return (
    <div
      data-boc-board-columns
      aria-label={props.t("boc.jira.board.columns.label")}
      class="flex min-h-0 flex-1 gap-2 overflow-x-auto"
      onKeyDown={moveFocus}
    >
      <For each={props.groups}>
        {(group, columnIndex) => {
          const name = () =>
            group.column.id === "unmapped" ? props.t("boc.jira.board.column.other") : group.column.name
          const empty = () => group.issues.length === 0
          return (
            <section
              data-boc-board-column={group.column.id}
              data-boc-column-index={columnIndex()}
              data-empty={empty() ? "" : undefined}
              aria-labelledby={`boc-jira-column-${columnIndex()}`}
              tabIndex={0}
              class="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[8px] bg-v2-background-bg-layer-01 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
              classList={{ "w-[17.5rem]": !empty(), "w-9 items-center gap-2.5 py-3": empty() }}
            >
              <Show
                when={!empty()}
                fallback={
                  <>
                    <Badge>{props.t("boc.jira.board.column.count", { count: 0 })}</Badge>
                    <h2
                      id={`boc-jira-column-${columnIndex()}`}
                      class="rotate-180 whitespace-nowrap text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:530] [writing-mode:vertical-rl]"
                    >
                      {name()}
                    </h2>
                  </>
                }
              >
                <header class="flex h-10 shrink-0 items-center gap-2 px-3">
                  <h2
                    id={`boc-jira-column-${columnIndex()}`}
                    class="min-w-0 truncate text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base [font-weight:530]"
                  >
                    {name()}
                  </h2>
                  <Badge class="ms-auto">
                    {props.t("boc.jira.board.column.count", { count: group.issues.length })}
                  </Badge>
                </header>
                <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">
                  <For each={group.issues}>
                    {(issue, cardIndex) => (
                      <JiraIssueCard
                        t={props.t}
                        issue={issue}
                        locale={props.locale}
                        index={cardIndex()}
                        selected={props.selectedIssueKey === issue.key}
                        sessionCount={props.sessionCounts[issue.url]}
                        deployedHosts={props.deployedHosts?.(issue.key)}
                        sessionActionsDisabled={props.sessionActionsDisabled}
                        onNewChat={() => props.onNewChat(issue)}
                        onStartWork={() => props.onStartWork(issue)}
                        onSelect={(returnFocus) => props.onSelectIssue(issue, returnFocus)}
                        onOpenExternal={props.onOpenExternal}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </section>
          )
        }}
      </For>
    </div>
  )
}
