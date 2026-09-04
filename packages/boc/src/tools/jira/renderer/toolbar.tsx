import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Menu } from "@opencode-ai/ui/menu"
import { Select } from "@opencode-ai/ui/select"
import { TextInput } from "@opencode-ai/ui/text-input"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { createMemo, For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import { JIRA_UNASSIGNED, MAX_SAVED_JIRA_BOARDS, uniqueIssueNames } from "../domain/board"
import type { JiraBoardIssue, JiraBoardSummary, JiraBoardView, JiraPreferences } from "../domain/board"
import type { JiraConnectionStatus } from "../rpcs"
import { jiraStatusLabel } from "./status"

const FILTER_ALL = "__boc_all__"

export function JiraBoardHeader(props: {
  t: BocTranslator
  connection?: JiraConnectionStatus
  board?: JiraBoardSummary
  preferences: JiraPreferences
  selectedBoardId?: number
  loading: boolean
  onRefresh: () => void
  onAddBoard: () => void
  onSelectBoard: (boardId: number) => void
  onOpenSettings: () => void
}) {
  const connected = () => props.connection?.status === "connected"
  const atSavedLimit = () => props.preferences.savedBoards.length >= MAX_SAVED_JIRA_BOARDS
  const canSwitch = () => props.preferences.savedBoards.length > 0

  return (
    <header
      data-boc-board-header
      class="flex h-11 shrink-0 items-center gap-3 border-b border-v2-border-border-muted px-4"
    >
      <h1 class="flex min-w-0 items-center overflow-hidden text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
        <Show when={canSwitch()} fallback={<BoardTitle t={props.t} board={props.board} />}>
          <Menu placement="bottom-start" gutter={4}>
            <Menu.Trigger
              type="button"
              data-boc-board-switcher
              aria-label={props.t("boc.jira.board.switcher")}
              class="flex min-w-0 max-w-full items-center gap-1 rounded-sm text-left outline-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus data-[expanded]:bg-v2-overlay-simple-overlay-pressed"
            >
              <BoardTitle t={props.t} board={props.board} />
              <Icon name="chevron-down" size="small" class="shrink-0 text-v2-icon-icon-accent" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content>
                <Menu.RadioGroup
                  value={props.selectedBoardId !== undefined ? String(props.selectedBoardId) : undefined}
                  onChange={(value) => {
                    if (value) props.onSelectBoard(Number(value))
                  }}
                >
                  <For each={props.preferences.savedBoards}>
                    {(board) => (
                      <Menu.RadioItem value={String(board.id)} closeOnSelect>
                        {board.projectName ? `${board.projectName} / ${board.name}` : board.name}
                      </Menu.RadioItem>
                    )}
                  </For>
                </Menu.RadioGroup>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </Show>
      </h1>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <Show when={connected()}>
          <Tooltip value={props.t("boc.jira.board.savedFull")} inactive={!atSavedLimit()} placement="bottom">
            <Button
              type="button"
              variant="ghost-muted"
              size="small"
              icon="plus"
              disabled={atSavedLimit()}
              onClick={props.onAddBoard}
            >
              {props.t("boc.jira.board.add")}
            </Button>
          </Tooltip>
        </Show>
        <Tooltip
          value={props.connection ? jiraStatusLabel(props.t, props.connection) : props.t("boc.jira.connection.loading")}
          placement="bottom"
        >
          <Button type="button" variant="ghost-muted" size="small" icon="settings-gear" onClick={props.onOpenSettings}>
            {props.t("boc.jira.connection.settings")}
          </Button>
        </Tooltip>
        <Show when={connected()}>
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.jira.board.refresh")}
            disabled={props.loading}
            icon={<Icon name="reset" classList={{ "animate-spin motion-reduce:animate-none": props.loading }} />}
            onClick={props.onRefresh}
          />
        </Show>
      </div>
    </header>
  )
}

export function JiraBoardToolbar(props: {
  t: BocTranslator
  board?: JiraBoardView
  sprintId?: number
  issues: readonly JiraBoardIssue[]
  filtered: readonly JiraBoardIssue[]
  search: string
  assignee?: string
  issueType?: string
  priority?: string
  onSelectSprint: (sprintId: number) => void
  onSearch: (value: string) => void
  onFilter: (field: "assignee" | "issueType" | "priority", value?: string) => void
  onClearFilters: () => void
}) {
  const narrowed = () => Boolean(props.search || props.assignee || props.issueType || props.priority)

  return (
    <div data-boc-board-toolbar class="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2.5">
      <TextInput
        aria-label={props.t("boc.jira.board.search.label")}
        class="!w-56"
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

      <FilterSelect
        label={props.t("boc.jira.board.filters.assignee")}
        allLabel={props.t("boc.jira.board.filters.assignee.all")}
        value={props.assignee}
        options={[JIRA_UNASSIGNED, ...uniqueIssueNames(props.issues, "assigneeName")]}
        optionLabel={(value) => (value === JIRA_UNASSIGNED ? props.t("boc.jira.board.filters.unassigned") : value)}
        onSelect={(value) => props.onFilter("assignee", value)}
      />
      <FilterSelect
        label={props.t("boc.jira.board.filters.type")}
        allLabel={props.t("boc.jira.board.filters.type.all")}
        value={props.issueType}
        options={uniqueIssueNames(props.issues, "issueTypeName")}
        optionLabel={(value) => value}
        onSelect={(value) => props.onFilter("issueType", value)}
      />
      <FilterSelect
        label={props.t("boc.jira.board.filters.priority")}
        allLabel={props.t("boc.jira.board.filters.priority.all")}
        value={props.priority}
        options={uniqueIssueNames(props.issues, "priorityName")}
        optionLabel={(value) => value}
        onSelect={(value) => props.onFilter("priority", value)}
      />
      <Show when={narrowed()}>
        <Button type="button" variant="ghost-muted" size="small" icon="xmark-small" onClick={props.onClearFilters}>
          {props.t("boc.jira.board.filters.clear")}
        </Button>
      </Show>

      <Show when={props.issues.length > 0}>
        <span class="ml-auto text-[12px] leading-[var(--line-height-compact)] tabular-nums text-v2-text-text-faint">
          {narrowed()
            ? props.t("boc.jira.board.issueCount.filtered", {
                count: props.filtered.length,
                total: props.issues.length,
              })
            : props.t("boc.jira.board.issueCount", { count: props.issues.length })}
        </span>
      </Show>
    </div>
  )
}

function BoardTitle(props: { t: BocTranslator; board?: JiraBoardSummary }) {
  return (
    <span class="min-w-0 truncate">
      {props.t("boc.jira.title")}
      <Show when={props.board}>
        {(board) => (
          <>
            <span class="text-v2-text-text-faint">: </span>
            <Show when={board().projectName}>
              {(project) => <span class="font-normal text-v2-text-text-muted">{project()} / </span>}
            </Show>
            {board().name}
          </>
        )}
      </Show>
    </span>
  )
}

function FilterSelect(props: {
  label: string
  allLabel: string
  value?: string
  options: string[]
  optionLabel: (value: string) => string
  onSelect: (value?: string) => void
}) {
  const options = createMemo(() => [
    { id: FILTER_ALL, label: props.allLabel },
    ...props.options.map((value) => ({ id: value, label: props.optionLabel(value) })),
  ])
  const current = () => options().find((option) => option.id === (props.value ?? FILTER_ALL)) ?? options()[0]

  return (
    <Select
      aria-label={props.label}
      options={options()}
      current={current()}
      value={(option) => option.id}
      label={(option) => option.label}
      classList={{ "[&_[data-slot=select-v2-value-text]]:text-v2-text-text-accent": props.value !== undefined }}
      onSelect={(option) => props.onSelect(option && option.id !== FILTER_ALL ? option.id : undefined)}
    />
  )
}
