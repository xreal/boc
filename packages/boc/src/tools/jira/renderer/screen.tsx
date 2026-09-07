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
  filterIssuesByLane,
  groupIssuesByColumn,
  resolveSetupBoardId,
  resolveSprintId,
  type JiraBoardIssue,
  type JiraBoardLane,
  type JiraBoardSummary,
  type JiraBoardView,
  type JiraIssueDetail,
  type JiraPreferences,
} from "../domain/board"
import type { JiraConnectionFailure, JiraConnectionStatus } from "../rpcs"
import { JiraBoardColumns } from "./columns"
import { JiraIssueInspector } from "./inspector"
import { createJiraBoardLanes } from "./lanes"
import { createLatestRequest, type LatestRequest } from "./latest-request"
import { JiraPickBoardDialog } from "./pick-board"
import { JiraSettingsDialog } from "./settings"
import { jiraBoardMessage, jiraBoardSurface } from "./surface"
import { JiraBoardHeader, JiraBoardToolbar } from "./toolbar"

type BoardLoadOptions = {
  request?: LatestRequest
  keepSprint?: boolean
  resetView?: boolean
}

export default function JiraScreen(props: BocScreenProps) {
  const desktop = useBocDesktop()
  const t = createBocTranslator(props.host.locale)
  const dialog = useDialog()
  let inspectorReturnFocus: HTMLButtonElement | undefined
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
    lane: "stories" as JiraBoardLane,
    search: "",
    assignee: undefined as string | undefined,
    issueType: undefined as string | undefined,
    priority: undefined as string | undefined,
    selectedIssueKey: undefined as string | undefined,
    issue: undefined as JiraIssueDetail | undefined,
    issueFailure: undefined as JiraConnectionFailure | undefined,
    loading: false as false | "workspace" | "board" | "issues" | "issue",
    failure: undefined as JiraConnectionFailure | undefined,
  })

  if (!desktop) return null

  const filtered = () =>
    filterIssuesByLane(
      filterIssues(view.issues, {
        search: view.search,
        assignee: view.assignee,
        issueType: view.issueType,
        priority: view.priority,
      }),
      view.lane,
    )
  const hasIssueFilters = () => Boolean(view.search || view.assignee || view.issueType || view.priority)
  const groups = () => groupIssuesByColumn(view.board?.columns ?? [], filtered())
  const selectedBoard = () =>
    view.boards.find((board) => board.id === view.selectedBoardId) ??
    view.preferences.savedBoards.find((board) => board.id === view.selectedBoardId)
  const refreshing = () => view.loading !== false && view.loading !== "issue"
  const surface = () =>
    jiraBoardSurface({
      online: view.online,
      connection: view.connection,
      // A refresh or sprint change keeps the previous columns visible; only an empty board waits on the loader.
      loading: refreshing() && view.issues.length === 0,
      failure: view.failure,
      boards: view.boards,
      board: view.board,
      issues: view.issues,
      filtered: filtered(),
      hasIssueFilters: hasIssueFilters(),
    })

  const lanes = createJiraBoardLanes({
    issues: () => view.issues,
    site: () => (view.connection?.status === "connected" ? view.connection.site : undefined),
    boardId: () => view.selectedBoardId,
    lane: () => view.lane,
    ready: () => view.loading === false && view.board !== undefined && view.failure === undefined,
  })

  const boardRequests = createLatestRequest({
    prefix: "board",
    cancel: (requestId) => void desktop.jira.cancelBoardRead({ requestId }).catch(() => undefined),
  })
  const issueRequests = createLatestRequest({
    prefix: "issue",
    cancel: (requestId) => void desktop.jira.cancelIssueRead({ requestId }).catch(() => undefined),
  })
  const beginBoardRequest = () => {
    issueRequests.invalidate()
    return boardRequests.begin()
  }

  const bootstrap = async () => {
    const request = beginBoardRequest()
    setView({ loading: "workspace", failure: undefined, issueFailure: undefined })
    const connection = await desktop.jira.getConnectionStatus()
    if (!boardRequests.isCurrent(request)) return
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
      boardRequests.finish(request)
      return
    }

    const [boardsResult, preferences] = await Promise.all([
      desktop.jira.listBoards({ requestId: request.requestId }),
      desktop.jira.getPreferences(),
    ])
    if (!boardRequests.isCurrent(request)) return
    if (!boardsResult.ok) {
      setView({ loading: false, failure: boardsResult, boards: [], board: undefined, issues: [] })
      boardRequests.finish(request)
      return
    }

    const selectedBoardId = resolveSetupBoardId(view.selectedBoardId, preferences, boardsResult.boards)
    setView({
      boards: boardsResult.boards,
      preferences,
      selectedBoardId,
      failure: undefined,
    })
    if (selectedBoardId === undefined) {
      setView({ loading: false, board: undefined, issues: [] })
      boardRequests.finish(request)
      return
    }
    await loadBoard(selectedBoardId, { request, keepSprint: true, resetView: false })
  }

  const loadBoard = async (boardId: number, options: BoardLoadOptions = {}) => {
    const request = options.request ?? beginBoardRequest()
    const requestedSprint = options.keepSprint ? view.sprintId : undefined
    setView({
      selectedBoardId: boardId,
      loading: "board",
      failure: undefined,
      ...(options.resetView === false
        ? {}
        : {
            board: undefined,
            issues: [],
            selectedIssueKey: undefined,
            issue: undefined,
            issueFailure: undefined,
            search: "",
            assignee: undefined,
            issueType: undefined,
            priority: undefined,
          }),
    })
    const result = await desktop.jira.getBoard({ requestId: request.requestId, boardId })
    if (!boardRequests.isCurrent(request)) return
    if (!result.ok) {
      setView({ loading: false, failure: result, board: undefined, issues: [] })
      boardRequests.finish(request)
      return
    }

    const sprintId = resolveSprintId(requestedSprint, result.board.sprints, result.board.activeSprint)
    setView({ board: result.board, sprintId })
    if (result.board.type === "scrum" && sprintId === undefined) {
      setView({ loading: false, issues: [] })
      boardRequests.finish(request)
      return
    }
    await loadIssues(boardId, sprintId, request)
  }

  const loadIssues = async (boardId: number, sprintId: number | undefined, request = beginBoardRequest()) => {
    setView({
      loading: "issues",
      failure: undefined,
      sprintId,
      selectedIssueKey: undefined,
      issue: undefined,
      issueFailure: undefined,
    })
    const result = await desktop.jira.listIssues({
      requestId: request.requestId,
      boardId,
      ...(sprintId !== undefined ? { sprintId } : {}),
    })
    if (!boardRequests.isCurrent(request)) return
    if (!result.ok) {
      setView({ loading: false, failure: result, issues: [] })
      boardRequests.finish(request)
      return
    }
    setView({ loading: false, issues: result.issues, failure: undefined })
    boardRequests.finish(request)
  }

  const loadIssue = async (issueKey: string, returnFocus: HTMLButtonElement) => {
    const request = issueRequests.begin()
    inspectorReturnFocus = returnFocus
    setView({ selectedIssueKey: issueKey, loading: "issue", issue: undefined, issueFailure: undefined })
    const result = await desktop.jira.getIssue({ requestId: request.requestId, issueKey })
    if (!issueRequests.isCurrent(request)) return
    if (!result.ok) {
      setView({ loading: false, issueFailure: result })
      issueRequests.finish(request)
      return
    }
    setView({ loading: false, issue: result.issue, issueFailure: undefined })
    issueRequests.finish(request)
  }

  const openPickBoard = (kind: "default" | "add") => {
    void dialog.show(
      () => (
        <JiraPickBoardDialog
          api={desktop.jira}
          locale={props.host.locale}
          kind={kind}
          excludeIds={kind === "add" ? view.preferences.savedBoards.map((board) => board.id) : undefined}
          onSaved={(board, preferences) => {
            setView("preferences", preferences)
            if (kind === "add") setView("selectedBoardId", board.id)
            if (kind === "default") setView("selectedBoardId", preferences.defaultBoardId)
            dialog.close()
          }}
        />
      ),
      () => void bootstrap(),
    )
  }

  const openSettings = () => {
    void dialog.show(() => (
      <JiraSettingsDialog
        api={desktop.jira}
        locale={props.host.locale}
        openExternal={(url) => props.host.openExternal(url)}
        projects={props.host.sessions?.projects() ?? []}
        onChanged={() => void bootstrap()}
        onNeedsDefaultBoard={() => openPickBoard("default")}
      />
    ))
  }

  const closeInspector = () => {
    issueRequests.invalidate()
    setView({ selectedIssueKey: undefined, issue: undefined, issueFailure: undefined })
    queueMicrotask(() => inspectorReturnFocus?.focus())
  }

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
      boardRequests.invalidate()
      issueRequests.invalidate()
      wide.removeEventListener("change", syncWide)
      window.removeEventListener("online", syncOnline)
      window.removeEventListener("offline", syncOnline)
      window.removeEventListener("keydown", onKeyDown)
    })
  })

  return (
    <main
      data-boc-screen="jira"
      aria-busy={view.loading !== false}
      class="mx-2 mb-[var(--shell-bottom-inset,8px)] mt-[var(--shell-top-inset,8px)] flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-raised)]"
    >
      <JiraBoardHeader
        t={t}
        connection={view.connection}
        board={selectedBoard()}
        preferences={view.preferences}
        selectedBoardId={view.selectedBoardId}
        loading={refreshing()}
        onRefresh={() => void bootstrap()}
        onAddBoard={() => openPickBoard("add")}
        onSelectBoard={(boardId) => void loadBoard(boardId)}
        onOpenSettings={openSettings}
      />

      <Show when={view.connection?.status === "connected" && view.selectedBoardId !== undefined}>
        <JiraBoardToolbar
          t={t}
          board={view.board}
          sprintId={view.sprintId}
          issues={view.issues}
          filtered={filtered()}
          lanes={lanes()}
          lane={view.lane}
          search={view.search}
          assignee={view.assignee}
          issueType={view.issueType}
          priority={view.priority}
          onSelectLane={(lane) => setView("lane", lane)}
          onSelectSprint={(sprintId) => {
            if (view.selectedBoardId === undefined) return
            void loadIssues(view.selectedBoardId, sprintId)
          }}
          onSearch={(search) => setView("search", search)}
          onFilter={(field, value) => setView(field, value)}
          onClearFilters={() => setView({ search: "", assignee: undefined, issueType: undefined, priority: undefined })}
        />
      </Show>

      <Show when={surface() === "board"}>
        <div class="relative flex min-h-0 flex-1 gap-2 px-3 pb-3">
          <JiraBoardColumns
            t={t}
            locale={props.host.locale()}
            groups={groups()}
            selectedIssueKey={view.selectedIssueKey}
            onSelectIssue={(issue, returnFocus) => void loadIssue(issue.key, returnFocus)}
            onOpenExternal={(url) => props.host.openExternal(url)}
          />
          <Show when={view.selectedIssueKey}>
            <JiraIssueInspector
              t={t}
              locale={props.host.locale()}
              issueKey={view.selectedIssueKey!}
              boardId={view.selectedBoardId!}
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
          role={surface() === "error" || surface() === "rate-limit" ? "alert" : "status"}
          aria-live="polite"
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 pb-12 text-center text-[13px] leading-[var(--line-height-compact)]"
        >
          <Show when={surface() === "loading"}>
            <Loader />
          </Show>
          <p
            class="max-w-md text-v2-text-text-muted"
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
          <Show when={surface() === "needs-default"}>
            <Button type="button" variant="neutral" size="small" onClick={() => openPickBoard("default")}>
              {t("boc.jira.board.default.choose")}
            </Button>
          </Show>
          <Show when={surface() === "no-matches"}>
            <Button
              type="button"
              variant="outline"
              size="small"
              onClick={() => setView({ search: "", assignee: undefined, issueType: undefined, priority: undefined })}
            >
              {t("boc.jira.board.filters.clear")}
            </Button>
          </Show>
        </div>
      </Show>
    </main>
  )
}
