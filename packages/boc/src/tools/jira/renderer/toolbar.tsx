import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Select } from "@opencode-ai/ui/select"
import { TextInput } from "@opencode-ai/ui/text-input"
import { Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import { JIRA_UNASSIGNED, MAX_SAVED_JIRA_BOARDS, uniqueIssueNames } from "../domain/board"
import type { JiraBoardIssue, JiraBoardSummary, JiraBoardView, JiraPreferences } from "../domain/board"

const FILTER_ANY = "__boc_any__"

export function JiraBoardToolbar(props: {
  t: BocTranslator
  boards: readonly JiraBoardSummary[]
  preferences: JiraPreferences
  selectedBoardId?: number
  board?: JiraBoardView
  sprintId?: number
  issues: readonly JiraBoardIssue[]
  search: string
  assignee?: string
  issueType?: string
  priority?: string
  savingBoard: boolean
  onSelectBoard: (boardId: number) => void
  onSelectSprint: (sprintId: number) => void
  onSearch: (value: string) => void
  onFilter: (field: "assignee" | "issueType" | "priority", value?: string) => void
  onClearFilters: () => void
  onRefresh: () => void
  onSaveBoard: () => void
  onOpenSettings: () => void
}) {
  const [ui, setUi] = createStore({ filtersOpen: false })
  const selectedBoard = () => props.boards.find((board) => board.id === props.selectedBoardId)
  const savedIds = () => new Set(props.preferences.savedBoards.map((board) => board.id))
  const boardOptions = () => {
    const saved = savedIds()
    return [
      ...props.boards.filter((board) => saved.has(board.id)),
      ...props.boards.filter((board) => !saved.has(board.id)),
    ]
  }
  const boardSaved = () => (props.selectedBoardId !== undefined ? savedIds().has(props.selectedBoardId) : false)
  const atSavedLimit = () => props.preferences.savedBoards.length >= MAX_SAVED_JIRA_BOARDS
  const canSaveBoard = () => selectedBoard() !== undefined && !boardSaved() && !atSavedLimit()
  const assignees = () => uniqueIssueNames(props.issues, "assigneeName")
  const types = () => uniqueIssueNames(props.issues, "issueTypeName")
  const priorities = () => uniqueIssueNames(props.issues, "priorityName")
  const filterCount = () => [props.assignee, props.issueType, props.priority].filter(Boolean).length

  return (
    <div data-boc-board-toolbar class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <Select
          aria-label={props.t("boc.jira.board.picker.label")}
          options={[...boardOptions()]}
          current={selectedBoard()}
          value={(board) => String(board.id)}
          label={(board) => board.name}
          groupBy={(board) =>
            savedIds().has(board.id) ? props.t("boc.jira.board.group.saved") : props.t("boc.jira.board.group.all")
          }
          placeholder={props.t("boc.jira.board.picker.placeholder")}
          onSelect={(board) => {
            if (board) props.onSelectBoard(board.id)
          }}
        />
        <Show when={props.board?.type === "scrum" && props.board.sprints.length > 0}>
          <Select
            aria-label={props.t("boc.jira.board.sprint.label")}
            options={[...(props.board?.sprints ?? [])]}
            current={props.board?.sprints.find((sprint) => sprint.id === props.sprintId)}
            value={(sprint) => String(sprint.id)}
            label={(sprint) => sprint.name}
            placeholder={props.t("boc.jira.board.sprint.placeholder")}
            onSelect={(sprint) => {
              if (sprint) props.onSelectSprint(sprint.id)
            }}
          />
        </Show>
        <div class="min-w-[12rem] flex-1">
          <TextInput
            aria-label={props.t("boc.jira.board.search.label")}
            class="!w-full"
            name="jira-board-search"
            autocomplete="off"
            spellcheck={false}
            placeholder={props.t("boc.jira.board.search.placeholder")}
            value={props.search}
            leadingIcon={<Icon name="magnifying-glass" />}
            showClearButton={props.search.length > 0}
            clearLabel={props.t("boc.jira.board.filters.clear")}
            onClearClick={() => props.onSearch("")}
            onInput={(event) => props.onSearch(event.currentTarget.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="small"
          aria-expanded={ui.filtersOpen}
          aria-controls="boc-jira-board-filters"
          onClick={() => setUi("filtersOpen", !ui.filtersOpen)}
        >
          {filterCount() > 0
            ? props.t("boc.jira.board.filters.active", { count: filterCount() })
            : props.t("boc.jira.board.filters")}
        </Button>
        <Button type="button" variant="outline" size="small" onClick={props.onRefresh}>
          {props.t("boc.jira.board.refresh")}
        </Button>
        <Show when={canSaveBoard()}>
          <Button type="button" variant="outline" size="small" disabled={props.savingBoard} onClick={props.onSaveBoard}>
            {props.t("boc.jira.board.save")}
          </Button>
        </Show>
        <Show when={boardSaved()}>
          <span class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {props.t("boc.jira.board.saved")}
          </span>
        </Show>
        <Show when={!boardSaved() && selectedBoard() && atSavedLimit()}>
          <span class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {props.t("boc.jira.board.savedFull")}
          </span>
        </Show>
        <Button type="button" variant="outline" size="small" onClick={props.onOpenSettings}>
          {props.t("boc.jira.connection.settings")}
        </Button>
      </div>
      <Show when={ui.filtersOpen}>
        <div
          id="boc-jira-board-filters"
          data-boc-board-filters
          aria-label={props.t("boc.jira.board.filters")}
          class="flex flex-wrap items-end gap-2"
        >
          <FilterSelect
            label={props.t("boc.jira.board.filters.assignee")}
            value={props.assignee}
            options={[JIRA_UNASSIGNED, ...assignees()]}
            optionLabel={(value) =>
              value === JIRA_UNASSIGNED ? props.t("boc.jira.board.filters.unassigned") : value
            }
            anyLabel={props.t("boc.jira.board.filters.any")}
            onSelect={(value) => props.onFilter("assignee", value)}
          />
          <FilterSelect
            label={props.t("boc.jira.board.filters.type")}
            value={props.issueType}
            options={types()}
            optionLabel={(value) => value}
            anyLabel={props.t("boc.jira.board.filters.any")}
            onSelect={(value) => props.onFilter("issueType", value)}
          />
          <FilterSelect
            label={props.t("boc.jira.board.filters.priority")}
            value={props.priority}
            options={priorities()}
            optionLabel={(value) => value}
            anyLabel={props.t("boc.jira.board.filters.any")}
            onSelect={(value) => props.onFilter("priority", value)}
          />
          <Button type="button" variant="ghost" size="small" onClick={props.onClearFilters}>
            {props.t("boc.jira.board.filters.clear")}
          </Button>
        </div>
      </Show>
    </div>
  )
}

function FilterSelect(props: {
  label: string
  value?: string
  options: string[]
  optionLabel: (value: string) => string
  anyLabel: string
  onSelect: (value?: string) => void
}) {
  const options = createMemo(() => [
    { id: FILTER_ANY, label: props.anyLabel },
    ...props.options.map((value) => ({ id: value, label: props.optionLabel(value) })),
  ])
  const current = () => options().find((option) => option.id === (props.value ?? FILTER_ANY)) ?? options()[0]

  return (
    <label class="flex min-w-[9rem] flex-col gap-1 text-[13px] leading-[var(--line-height-compact)]">
      <span class="text-v2-text-text-muted">{props.label}</span>
      <Select
        aria-label={props.label}
        options={options()}
        current={current()}
        value={(option) => option.id}
        label={(option) => option.label}
        onSelect={(option) => props.onSelect(option && option.id !== FILTER_ANY ? option.id : undefined)}
      />
    </label>
  )
}
