import { For } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import type { JiraColumnGroup } from "../domain/board"
import { JiraIssueCard } from "./card"

export function JiraBoardColumns(props: {
  t: BocTranslator
  groups: JiraColumnGroup[]
  selectedIssueKey?: string
  onSelectIssue: (issue: JiraBoardIssue, returnFocus: HTMLButtonElement) => void
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
      class="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1"
      onKeyDown={moveFocus}
    >
      <For each={props.groups}>
        {(group, columnIndex) => (
          <section
            data-boc-board-column={group.column.id}
            data-boc-column-index={columnIndex()}
            aria-labelledby={`boc-jira-column-${columnIndex()}`}
            tabIndex={0}
            class="flex min-h-0 w-[17rem] shrink-0 flex-col overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
          >
            <header class="flex items-baseline justify-between gap-2 border-l-2 border-v2-border-border-strong px-3 py-2">
              <h2
                id={`boc-jira-column-${columnIndex()}`}
                class="text-[13px] font-medium leading-[var(--line-height-compact)] text-v2-text-text-base"
              >
                {group.column.id === "unmapped" ? props.t("boc.jira.board.column.other") : group.column.name}
              </h2>
              <span class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                {props.t("boc.jira.board.column.count", { count: group.issues.length })}
              </span>
            </header>
            <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              <For each={group.issues}>
                {(issue, cardIndex) => (
                  <JiraIssueCard
                    issue={issue}
                    index={cardIndex()}
                    selected={props.selectedIssueKey === issue.key}
                    onSelect={(returnFocus) => props.onSelectIssue(issue, returnFocus)}
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

export type JiraBoardFocusTarget = { columnIndex: number; cardIndex?: number }

export function jiraBoardFocusTarget(
  groups: readonly JiraColumnGroup[],
  columnIndex: number,
  cardIndex: number | undefined,
  key: string,
): JiraBoardFocusTarget | undefined {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const nextColumnIndex = columnIndex + (key === "ArrowLeft" ? -1 : 1)
    const nextColumn = groups[nextColumnIndex]
    if (!nextColumn) return
    if (cardIndex === undefined || nextColumn.issues.length === 0) return { columnIndex: nextColumnIndex }
    return { columnIndex: nextColumnIndex, cardIndex: Math.min(cardIndex, nextColumn.issues.length - 1) }
  }
  if (cardIndex === undefined) {
    if ((key === "ArrowDown" || key === "Enter") && groups[columnIndex]?.issues.length) {
      return { columnIndex, cardIndex: 0 }
    }
    return
  }
  if (key === "ArrowUp") {
    if (cardIndex === 0) return { columnIndex }
    return { columnIndex, cardIndex: cardIndex - 1 }
  }
  if (key === "ArrowDown" && cardIndex + 1 < (groups[columnIndex]?.issues.length ?? 0)) {
    return { columnIndex, cardIndex: cardIndex + 1 }
  }
  if (key === "Home") return { columnIndex, cardIndex: 0 }
  if (key === "End") return { columnIndex, cardIndex: (groups[columnIndex]?.issues.length ?? 1) - 1 }
}
