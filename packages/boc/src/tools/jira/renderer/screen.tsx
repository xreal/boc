import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Loader } from "@opencode-ai/ui/loader"
import { onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocScreenProps } from "../../../registry"
import { useBocDesktop } from "../../../renderer/desktop"
import { createBocTranslator } from "../../../renderer/i18n"
import {
  filterIssues,
  groupIssuesByColumn,
  MAX_SAVED_JIRA_BOARDS,
  normalizeSavedBoards,
  resolveSelectedBoardId,
  resolveSprintId,
  type JiraBoardIssue,
  type JiraBoardSummary,
  type JiraBoardView,
  type JiraIssueDetail,
  type JiraPreferences,
} from "../domain/board"
import type { JiraConnectionFailure, JiraConnectionStatus } from "../rpcs"
import { JiraBoardColumns } from "./columns"
import { JiraIssueInspector } from "./inspector"
import { JiraSettingsDialog } from "./settings"
import { jiraStatusLabel } from "./status"
import { jiraBoardMessage, jiraBoardSurface } from "./surface"
import { JiraBoardToolbar } from "./toolbar"

type BoardLoadOptions = {
  generation?: number
  keepSprint?: boolean
  resetView?: boolean
}

export default function JiraScreen(props: BocScreenProps) {
  const desktop = useBocDesktop()
  const t = createBocTranslator(props.host.locale)
  const dialog = useDialog()
  let boardGeneration = 0
  let issueGeneration = 0
  const [view, setView] = createStore({
    online: true,
    wide: true,
    connection: undefined as JiraConnectionStatus | undefined,
    boards: [] as readonly JiraBoardSummary[],
    preferences: { savedBoards: [] } as JiraPreferences,
    selectedBoardId: undefined as number | undefined,
    board: undefined as JiraBoardView | undefined,
    sprintId: undefined as number | undefined,
    issues: [] as readonly JiraBoardIssue[],
    search: "",
    assignee: undefined as string | undefined,
    issueType: undefined as string | undefined,
    priority: undefined as string | undefined,
    selectedIssueKey: undefined as string | undefined,
    issue: undefined as JiraIssueDetail | undefined,
    issueFailure: undefined as JiraConnectionFailure | undefined,
    loading: false as false | "workspace" | "board" | "issues" | "issue",
    savingBoard: false,
    failure: undefined as JiraConnectionFailure | undefined,
  })

  if (!desktop) return null

  const filtered = () =>
    filterIssues(view.issues, {
      search: view.search,
      assignee: view.assignee,
      issueType: view.issueType,
      priority: view.priority,
    })
  const groups = () => groupIssuesByColumn(view.board?.columns ?? [], filtered())
  const surface = () =>
    jiraBoardSurface({
      online: view.online,
      connection: view.connection,
      loading: view.loading === "workspace" || view.loading === "board" || view.loading === "issues",
      failure: view.failure,
      boards: view.boards,
      board: view.board,
      issues: view.issues,
      filtered: filtered(),
    })

  const beginBoard = () => ++boardGeneration
  const beginIssue = () => ++issueGeneration
  const staleBoard = (generation: number) => generation !== boardGeneration
  const staleIssue = (generation: number) => generation !== issueGeneration

  const bootstrap = async () => {
    const generation = beginBoard()
    setView({ loading: "workspace", failure: undefined, issueFailure: undefined })
    const connection = await desktop.jira.getConnectionStatus()
    if (staleBoard(generation)) return
    setView("connection", connection)
    if (connection.status !== "connected") {
      setView({
        loading: false,
        boards: [],
        board: undefined,
        issues: [],
        selectedBoardId: undefined,
        sprintId: undefined,
        selectedIssueKey: undefined,
        issue: undefined,
      })
      return
    }

    const [boardsResult, preferences] = await Promise.all([desktop.jira.listBoards(), desktop.jira.getPreferences()])
    if (staleBoard(generation)) return
    if (!boardsResult.ok) {
      setView({ loading: false, failure: boardsResult, boards: [], board: undefined, issues: [] })
      return
    }

    const selectedBoardId = resolveSelectedBoardId(view.selectedBoardId, preferences, boardsResult.boards)
    setView({
      boards: boardsResult.boards,
      preferences,
      selectedBoardId,
      failure: undefined,
    })
    if (selectedBoardId === undefined) {
      setView({ loading: false, board: undefined, issues: [] })
      return
    }
    await loadBoard(selectedBoardId, { generation, keepSprint: true, resetView: false })
  }

  const loadBoard = async (boardId: number, options: BoardLoadOptions = {}) => {
    const generation = options.generation ?? beginBoard()
    const requestedSprint = options.keepSprint ? view.sprintId : undefined
    setView({
      selectedBoardId: boardId,
      loading: "board",
      failure: undefined,
      ...(options.resetView === false
        ? {}
        : {
            selectedIssueKey: undefined,
            issue: undefined,
            issueFailure: undefined,
            search: "",
            assignee: undefined,
            issueType: undefined,
            priority: undefined,
          }),
    })
    const result = await desktop.jira.getBoard({ boardId })
    if (staleBoard(generation)) return
    if (!result.ok) {
      setView({ loading: false, failure: result, board: undefined, issues: [] })
      return
    }

    const sprintId = resolveSprintId(requestedSprint, result.board.sprints, result.board.activeSprint)
    setView({ board: result.board, sprintId })
    if (result.board.type === "scrum" && sprintId === undefined) {
      setView({ loading: false, issues: [] })
      return
    }
    await loadIssues(boardId, sprintId, generation)
  }

  const loadIssues = async (boardId: number, sprintId: number | undefined, generation = beginBoard()) => {
    setView({
      loading: "issues",
      failure: undefined,
      sprintId,
      selectedIssueKey: undefined,
      issue: undefined,
      issueFailure: undefined,
    })
    const result = await desktop.jira.listIssues({
      boardId,
      ...(sprintId !== undefined ? { sprintId } : {}),
    })
    if (staleBoard(generation)) return
    if (!result.ok) {
      setView({ loading: false, failure: result, issues: [] })
      return
    }
    setView({ loading: false, issues: result.issues, failure: undefined })
  }

  const loadIssue = async (issueKey: string) => {
    const generation = beginIssue()
    setView({ selectedIssueKey: issueKey, loading: "issue", issue: undefined, issueFailure: undefined })
    const result = await desktop.jira.getIssue({ issueKey })
    if (staleIssue(generation)) return
    if (!result.ok) {
      setView({ loading: false, issueFailure: result })
      return
    }
    setView({ loading: false, issue: result.issue, issueFailure: undefined })
  }

  const saveCurrentBoard = async () => {
    const board = view.boards.find((entry) => entry.id === view.selectedBoardId)
    if (!board) return
    if (view.preferences.savedBoards.some((entry) => entry.id === board.id)) return
    if (view.preferences.savedBoards.length >= MAX_SAVED_JIRA_BOARDS) return
    setView("savingBoard", true)
    const preferences = normalizeSavedBoards(
      [...view.preferences.savedBoards, board],
      view.preferences.defaultBoardId ?? board.id,
    )
    const saved = await desktop.jira.savePreferences(preferences)
    setView({ preferences: saved, savingBoard: false })
  }

  const openSettings = () => {
    void dialog.show(() => (
      <JiraSettingsDialog
        api={desktop.jira}
        locale={props.host.locale}
        openExternal={(url) => props.host.openExternal(url)}
        onChanged={() => void bootstrap()}
      />
    ))
  }

  const closeInspector = () => setView({ selectedIssueKey: undefined, issue: undefined, issueFailure: undefined })

  onMount(() => {
    const wide = window.matchMedia("(min-width: 56rem)")
    const syncWide = () => setView("wide", wide.matches)
    const syncOnline = () => setView("online", navigator.onLine)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !view.selectedIssueKey) return
      closeInspector()
    }
    syncWide()
    syncOnline()
    wide.addEventListener("change", syncWide)
    window.addEventListener("online", syncOnline)
    window.addEventListener("offline", syncOnline)
    window.addEventListener("keydown", onKeyDown)
    void bootstrap()
    onCleanup(() => {
      wide.removeEventListener("change", syncWide)
      window.removeEventListener("online", syncOnline)
      window.removeEventListener("offline", syncOnline)
      window.removeEventListener("keydown", onKeyDown)
    })
  })

  return (
    <main data-boc-screen="jira" class="relative flex min-h-0 flex-1 flex-col px-2 pb-2 pt-2 text-v2-text-text-base">
      <section class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg bg-v2-background-bg-raised px-4 py-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-col gap-1">
            <h1 class="text-[16px] font-medium leading-[var(--line-height-base)]">{t("boc.jira.board.title")}</h1>
            <Show when={view.connection}>
              {(connection) => (
                <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                  {jiraStatusLabel(t, connection())}
                </p>
              )}
            </Show>
          </div>
          <Show when={view.connection?.status !== "connected"}>
            <Button type="button" variant="outline" size="small" onClick={openSettings}>
              {t("boc.jira.connection.settings")}
            </Button>
          </Show>
        </div>

        <Show when={view.connection?.status === "connected"}>
          <JiraBoardToolbar
            t={t}
            boards={view.boards}
            preferences={view.preferences}
            selectedBoardId={view.selectedBoardId}
            board={view.board}
            sprintId={view.sprintId}
            issues={view.issues}
            search={view.search}
            assignee={view.assignee}
            issueType={view.issueType}
            priority={view.priority}
            savingBoard={view.savingBoard}
            onSelectBoard={(boardId) => void loadBoard(boardId)}
            onSelectSprint={(sprintId) => {
              if (view.selectedBoardId === undefined) return
              void loadIssues(view.selectedBoardId, sprintId)
            }}
            onSearch={(search) => setView("search", search)}
            onFilter={(field, value) => setView(field, value)}
            onClearFilters={() => setView({ search: "", assignee: undefined, issueType: undefined, priority: undefined })}
            onRefresh={() => void bootstrap()}
            onSaveBoard={() => void saveCurrentBoard()}
            onOpenSettings={openSettings}
          />
        </Show>

        <Show when={surface() === "board"}>
          <div class="relative flex min-h-0 flex-1 gap-2">
            <JiraBoardColumns
              t={t}
              groups={groups()}
              selectedIssueKey={view.selectedIssueKey}
              onSelectIssue={(issue) => void loadIssue(issue.key)}
            />
            <Show when={view.selectedIssueKey}>
              <JiraIssueInspector
                t={t}
                issue={view.issue}
                loading={view.loading === "issue"}
                overlay={!view.wide}
                failure={view.issueFailure}
                onClose={closeInspector}
                onOpenExternal={(url) => props.host.openExternal(url)}
              />
            </Show>
          </div>
        </Show>

        <Show when={surface() !== "board"}>
          <div
            data-boc-board-surface={surface()}
            class="flex min-h-0 flex-1 flex-col items-start justify-center gap-3 text-[13px] leading-[var(--line-height-compact)]"
          >
            <Show when={view.loading}>
              <Loader />
            </Show>
            <p
              class="max-w-xl text-v2-text-text-muted"
              classList={{
                "text-v2-state-fg-danger": surface() === "error" || surface() === "rate-limit",
                "text-v2-state-fg-warning": surface() === "encryption-unavailable" || surface() === "offline",
              }}
            >
              {surface() === "not-configured"
                ? t("boc.jira.placeholder.description")
                : jiraBoardMessage(t, surface(), view.failure)}
            </p>
            <Show when={surface() === "not-configured" || surface() === "encryption-unavailable"}>
              <Button type="button" variant="neutral" size="small" onClick={openSettings}>
                {t("boc.jira.connection.settings")}
              </Button>
            </Show>
          </div>
        </Show>
      </section>
    </main>
  )
}
