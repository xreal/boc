import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { TextInput } from "@opencode/ui/text-input"
import { For, createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createBocTranslator } from "../../../renderer/i18n"
import { normalizeSavedBoards, type JiraBoardSummary, type JiraPreferences } from "../domain/board"
import type { JiraConnectionFailure } from "../rpcs"
import { createLatestRequest } from "./latest-request"
import { jiraConnectionErrorKey } from "./status"

export function JiraPickBoardDialog(props: {
  api: BocDesktopAPI["jira"]
  locale: () => string
  kind: "default" | "add"
  excludeIds?: readonly number[]
  onSaved: (board: JiraBoardSummary, preferences: JiraPreferences) => void
}) {
  const t = createBocTranslator(props.locale)
  const requests = createLatestRequest({
    prefix: "pick-board",
    cancel: (requestId) => void props.api.cancelBoardRead({ requestId }).catch(() => undefined),
  })
  const [form, setForm] = createStore({
    boards: [] as JiraBoardSummary[],
    selectedId: undefined as number | undefined,
    query: "",
    loading: true,
    saving: false,
    failure: undefined as JiraConnectionFailure | undefined,
  })

  const excluded = () => new Set(props.excludeIds ?? [])
  const available = () => form.boards.filter((board) => !excluded().has(board.id))
  const filtered = () => {
    const query = form.query.trim().toLowerCase()
    const boards = available()
    if (!query) return boards
    return boards.filter((board) => boardTitle(board).toLowerCase().includes(query))
  }
  const selected = () => available().find((board) => board.id === form.selectedId)
  const canSave = () => selected() !== undefined && !form.loading && !form.saving
  const adding = () => props.kind === "add"

  const loadBoards = async () => {
    const request = requests.begin()
    setForm({ loading: true, failure: undefined, query: "" })
    const result = await props.api.listBoards({ requestId: request.requestId })
    if (!requests.isCurrent(request)) return
    if (!result.ok) {
      setForm({ loading: false, failure: result, boards: [] })
      requests.finish(request)
      return
    }
    const boards = result.boards.filter((board) => !excluded().has(board.id))
    setForm({
      loading: false,
      boards: [...result.boards],
      selectedId: boards.length === 1 ? boards[0]?.id : undefined,
      failure: undefined,
    })
    requests.finish(request)
  }

  const move = (delta: number) => {
    const boards = filtered()
    if (boards.length === 0) return
    const index = boards.findIndex((board) => board.id === form.selectedId)
    const start = delta > 0 ? 0 : boards.length - 1
    const next = index === -1 ? start : Math.max(0, Math.min(boards.length - 1, index + delta))
    setForm("selectedId", boards[next]!.id)
  }

  const save = async () => {
    const board = selected()
    if (!board || form.saving) return
    setForm("saving", true)
    const current = await props.api.getPreferences()
    const savedBoards = current.savedBoards.some((entry) => entry.id === board.id)
      ? current.savedBoards
      : [...current.savedBoards, board]
    const defaultBoardId = adding() ? current.defaultBoardId : board.id
    const preferences = await props.api.savePreferences(
      normalizeSavedBoards(savedBoards, defaultBoardId ?? board.id, current.projectTargets),
    )
    props.onSaved(board, preferences)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key !== "Enter" || !canSave()) return
    event.preventDefault()
    void save()
  }

  onMount(() => {
    void loadBoards()
    onCleanup(() => requests.invalidate())
  })

  createEffect(() => {
    const id = form.selectedId
    if (id === undefined) return
    queueMicrotask(() => {
      const option = document.querySelector(`[data-boc-board-option="${id}"]`)
      if (option instanceof HTMLElement) option.scrollIntoView({ block: "nearest" })
    })
  })

  return (
    <Dialog size="large" data-boc-dialog={adding() ? "jira-add-board" : "jira-default-board"}>
      <DialogHeader closeLabel={t("boc.jira.connection.close")}>
        <DialogTitleGroup
          title={adding() ? t("boc.jira.board.add.title") : t("boc.jira.board.default.title")}
          description={adding() ? t("boc.jira.board.add.description") : t("boc.jira.board.default.description")}
        />
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-1 flex-col px-4 pb-2 pt-px">
        <div class="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={onKeyDown}>
        <Show when={form.loading}>
          <p
            role="status"
            class="flex items-center gap-2 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted"
          >
            <Loader />
            {t("boc.jira.board.default.loading")}
          </p>
        </Show>
        <Show when={!form.loading && form.failure}>
          {(failure) => (
            <p role="alert" class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-danger">
              {t(jiraConnectionErrorKey[failure().category])}
            </p>
          )}
        </Show>
        <Show when={!form.loading && !form.failure && form.boards.length === 0}>
          <p role="status" class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {t("boc.jira.board.noBoards")}
          </p>
        </Show>
        <Show when={!form.loading && !form.failure && form.boards.length > 0 && available().length === 0}>
          <p role="status" class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {t("boc.jira.board.add.empty")}
          </p>
        </Show>
        <Show when={!form.loading && available().length > 0}>
          <div class="flex min-h-0 flex-1 flex-col gap-3">
          <div class="shrink-0 p-px">
          <TextInput
            autofocus
            class="!w-full"
            name="jira-board-picker-search"
            autocomplete="off"
            spellcheck={false}
            aria-label={t("boc.jira.board.picker.search")}
            placeholder={t("boc.jira.board.picker.search")}
            value={form.query}
            leadingIcon={<Icon name="magnifying-glass" />}
            showClearButton={form.query.length > 0}
            clearLabel={t("boc.jira.board.filters.clear")}
            disabled={form.saving}
            onClearClick={() => setForm("query", "")}
            onInput={(event) => setForm("query", event.currentTarget.value)}
          />
          </div>
          <Show
            when={filtered().length > 0}
            fallback={
              <p role="status" class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                {t("boc.jira.board.picker.noMatches")}
              </p>
            }
          >
            <ul
              role="listbox"
              aria-label={t("boc.jira.board.picker.label")}
              class="min-h-0 flex-1 overflow-y-auto rounded-[6px] border border-v2-border-border-muted"
            >
              <For each={filtered()}>
                {(board) => (
                  <li>
                    <button
                      type="button"
                      role="option"
                      data-boc-board-option={board.id}
                      aria-selected={form.selectedId === board.id}
                      disabled={form.saving}
                      class="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] leading-[var(--line-height-compact)] outline-none hover:bg-v2-overlay-simple-overlay-hover focus-visible:bg-v2-overlay-simple-overlay-hover"
                      classList={{
                        "bg-v2-overlay-simple-overlay-pressed": form.selectedId === board.id,
                      }}
                      onClick={() => setForm("selectedId", board.id)}
                      onDblClick={() => void save()}
                    >
                      <span class="min-w-0 flex-1 truncate">
                        <Show when={board.projectName}>
                          {(project) => <span class="text-v2-text-text-muted">{project()} / </span>}
                        </Show>
                        {board.name}
                      </span>
                      <Show when={form.selectedId === board.id}>
                        <Icon name="check" size="small" class="shrink-0 text-v2-icon-icon-accent" />
                      </Show>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          </div>
        </Show>
        </div>
      </DialogBody>
      <DialogFooter>
        <Show when={form.failure}>
          <Button type="button" variant="outline" disabled={form.loading} onClick={() => void loadBoards()}>
            {t("boc.jira.board.refresh")}
          </Button>
        </Show>
        <Button type="button" variant="neutral" disabled={!canSave()} onClick={() => void save()}>
          {adding() ? t("boc.jira.board.add") : t("boc.jira.connection.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function boardTitle(board: JiraBoardSummary) {
  if (!board.projectName) return board.name
  return `${board.projectName} / ${board.name}`
}
