import type { ControlItem } from "../host"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { Tooltip } from "@opencode/ui/tooltip"
import { createMemo, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocScreenProps } from "../../../registry"
import { createBocTranslator, type BocTranslator } from "../../../renderer/i18n"
import { createProjectControls, type ControlError } from "./state"
import { controlOrigin } from "./origin"
import { ConfigurationEditor } from "./configuration-editor"
import { SourceEditor } from "./source-editor"
import { Choice } from "./choice"
import "./screen.css"

const kinds = ["agent", "skill", "mcp", "tool", "instruction"] as const
const categoryIcons = {
  agent: "subagent",
  skill: "flask",
  tool: "code-lines",
  mcp: "status",
  instruction: "edit",
} as const

const originIcons = { system: "server", global: "settings-gear", project: "folder", plugin: "sliders" } as const
const internalAgent = (item: ControlItem) =>
  item.kind === "agent" && ["compaction", "title", "summary"].includes(item.id)

export default function ProjectControlsScreen(props: BocScreenProps) {
  const t = createBocTranslator(props.host.locale)
  const host = props.host.controls
  if (!host)
    return (
      <main class="p-6">
        <p>{t("boc.bergflow.error.unavailable")}</p>
      </main>
    )
  const query = new URLSearchParams(props.host.location().search)
  const server = query.get("server")
  const project = query.get("project")
  const directory = query.get("directory")
  const control = createProjectControls(
    host,
    server && project && directory ? { server, project, directory } : undefined,
  )
  const view = control.view
  let searchInput: HTMLInputElement | undefined
  onMount(() => {
    const find = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") return
      if (!searchInput?.isConnected || document.querySelector('dialog[open], [role="dialog"]')) return
      event.preventDefault()
      event.stopPropagation()
      searchInput.focus()
      searchInput.select()
    }
    window.addEventListener("keydown", find, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", find, { capture: true }))
  })
  const [filters, setFilters] = createStore({ search: "", category: "all" })
  const [editor, setEditor] = createStore({
    open: false,
    scope: "project" as "project" | "global",
    item: undefined as ControlItem | undefined,
    add: false,
    source: undefined as "skill" | "instruction" | undefined,
  })
  const selectedServer = () => view.selection?.server
  const serverInfo = () => host.servers().find((server) => server.key === selectedServer())
  const projectInfo = () => serverInfo()?.projects.find((project) => project.directory === view.selection?.project)
  const locations = () => [
    ...new Set([...(projectInfo()?.locations ?? []), ...(view.selection ? [view.selection.directory] : [])]),
  ]
  const origin = (item: ControlItem) =>
    item.origin ??
    controlOrigin(item.source, {
      project: [view.snapshot?.info.project.canonical ?? "", ...locations()],
      global: serverInfo()?.globalDirectories ?? [],
    })
  const filtered = createMemo(() => {
    const query = filters.search.trim().toLocaleLowerCase()
    return (
      view.snapshot?.items.filter(
        (item) =>
          (filters.category === "all" || item.kind === filters.category) &&
          (!query || [item.name, item.id, item.source].some((text) => text.toLocaleLowerCase().includes(query))),
      ) ?? []
    )
  })
  const projects = createMemo(() =>
    host.servers().flatMap((server) =>
      server.projects.map((project) => ({
        ...project,
        server: server.key,
        serverName: server.name,
        key: JSON.stringify([server.key, project.directory]),
      })),
    ),
  )
  const edit = (scope: "project" | "global", item?: ControlItem, add = false) =>
    setEditor({
      open: true,
      scope,
      item,
      add,
      source: item?.kind === "skill" || item?.kind === "instruction" ? item.kind : undefined,
    })
  const disabled = () => view.stale || !!view.pending
  const clearFilters = () => {
    setFilters({ search: "", category: "all" })
  }
  return (
    <main
      data-boc-controls
      data-boc-screen="controls"
      class="mx-2 mb-[var(--shell-bottom-inset,8px)] mt-[var(--shell-top-inset,8px)] flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-raised)]"
    >
      <header class="controls-header">
        <h1 class="min-w-0 truncate text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
          {t("boc.bergflow.title")}
        </h1>
        <div class="controls-header-actions">
          <Show when={view.snapshot?.info.operations.includes("getConfiguration")}>
            <Button variant="ghost" size="small" disabled={disabled()} onClick={() => edit("global")}>
              {t("boc.controls.globalDefaults")}
            </Button>
            <Button variant="outline" size="small" disabled={disabled()} onClick={() => edit("project")}>
              {t("boc.controls.configure")}
            </Button>
            <Button size="small" disabled={disabled()} onClick={() => edit("project", undefined, true)}>
              {t("boc.controls.add")}
            </Button>
          </Show>
          <Button
            variant="outline"
            size="small"
            onClick={() => void preserveFocus(control.refresh)}
            disabled={!view.selection || view.loading || !!view.pending}
          >
            {t(view.loading && view.snapshot ? "boc.bergflow.refreshing" : "boc.bergflow.refresh")}
          </Button>
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 sm:p-6">
          <div class="controls-context">
            <div class="controls-project-line" aria-busy={!!view.pending}>
              <div class="controls-project-select text-12-medium">
                {t("boc.bergflow.project")}
                <Choice
                  label={t("boc.bergflow.project")}
                  value={view.selection ? JSON.stringify([view.selection.server, view.selection.project]) : ""}
                  disabled={!!view.pending}
                  options={projects().map((project) => ({
                    value: project.key,
                    label: host.servers().length > 1 ? `${project.name} · ${project.serverName}` : project.name,
                  }))}
                  onChange={(key) => {
                    const project = projects().find((project) => project.key === key)
                    if (project)
                      control.select({
                        server: project.server,
                        project: project.directory,
                        directory: project.directory,
                      })
                  }}
                />
              </div>
              <Show when={locations().length > 1}>
                <div class="controls-project-select text-12-medium">
                  {t("boc.bergflow.worktree")}
                  <Choice
                    label={t("boc.bergflow.worktree")}
                    value={view.selection?.directory ?? ""}
                    disabled={!!view.pending}
                    options={locations().map((directory) => ({
                      value: directory,
                      label:
                        directory === view.selection?.project
                          ? t("boc.controls.mainCheckout")
                          : (directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory),
                    }))}
                    onChange={(directory) => {
                      const selected = view.selection
                      if (selected) control.select({ ...selected, directory })
                    }}
                  />
                </div>
              </Show>
            </div>
            <Show when={view.selection}>
              <div class="flex flex-col gap-1 text-12-regular text-v2-text-text-muted">
                <p>{serverInfo()?.name}</p>
                <Show when={view.pending}>
                  <p role="status">{t("boc.bergflow.contextLocked")}</p>
                </Show>
              </div>
            </Show>
          </div>
          <div role="status" aria-live="polite" aria-atomic="true" class="controls-feedback text-13-regular">
            <Show when={view.error}>{(error) => <p>{t(`boc.bergflow.error.${error()}`)}</p>}</Show>
            <Show when={view.stale && view.snapshot}>
              <p class="mt-1 text-v2-text-text-muted">{t("boc.bergflow.stale")}</p>
            </Show>
          </div>
          <Show
            when={view.selection}
            fallback={<p class="py-12 text-center text-v2-text-text-muted">{t("boc.bergflow.choose")}</p>}
          >
            <Show
              when={!view.loading || view.snapshot}
              fallback={
                <div aria-busy="true" class="flex flex-col gap-3">
                  <For each={[1, 2, 3, 4]}>
                    {() => <div class="h-20 animate-pulse rounded-lg bg-v2-background-bg-layer-01" />}
                  </For>
                </div>
              }
            >
              <Show when={view.snapshot}>
                <div class="controls-filters">
                  <TextInput
                    ref={searchInput}
                    class="controls-search"
                    aria-label={t("boc.bergflow.search")}
                    leadingIcon={<Icon name="magnifying-glass" />}
                    value={filters.search}
                    onInput={(event) => setFilters("search", event.currentTarget.value)}
                    placeholder={t("boc.bergflow.search")}
                  />
                  <div class="controls-categories" role="group" aria-label={t("boc.bergflow.filter")}>
                    <For each={["all", ...kinds] as const}>
                      {(kind) => (
                        <button
                          type="button"
                          aria-pressed={filters.category === kind}
                          onClick={() => setFilters("category", kind)}
                        >
                          <Icon name={kind === "all" ? "outline-sliders" : categoryIcons[kind]} />
                          {t(`boc.bergflow.${kind}`)}
                          <span>
                            {
                              view.snapshot?.items.filter(
                                (item) => item.present && (kind === "all" || item.kind === kind),
                              ).length
                            }
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={view.snapshot?.incomplete.length}>
                  <p class="controls-notice text-12-regular">
                    <Icon name="info" />
                    {t("boc.bergflow.partial")}
                  </p>
                </Show>
                <For each={kinds}>
                  {(kind) => {
                    const items = () => filtered().filter((item) => item.kind === kind && item.present)
                    const row = (item: ControlItem & { key: string }) => (
                      <ControlRow
                        item={item}
                        origin={origin(item)}
                        t={t}
                        disabled={disabled()}
                        pending={view.pending === item.key}
                        error={view.rowError?.key === item.key ? view.rowError.error : undefined}
                        operations={view.snapshot?.info.operations ?? []}
                        canConnect={!!host.connectMcp}
                        edit={() => edit("project", item)}
                        change={(action, enabled) => void preserveFocus(() => control.mutate(item, action, enabled))}
                      />
                    )
                    return (
                      <Show when={items().length}>
                        <section class="min-w-0">
                          <h2 class="mb-2 flex items-center gap-2 text-14-medium">
                            <span class="controls-category-icon" aria-hidden="true">
                              <Icon name={categoryIcons[kind]} />
                            </span>
                            {t(`boc.bergflow.${kind}`)}{" "}
                            <span class="controls-count text-12-regular text-v2-text-text-muted">{items().length}</span>
                          </h2>
                          <Show when={items().some((item) => !internalAgent(item))}>
                            <div class="controls-cards">
                              <TableHeader kind={kind} t={t} />
                              <For each={items().filter((item) => !internalAgent(item))}>{row}</For>
                            </div>
                          </Show>
                          <Show when={items().some(internalAgent)}>
                            <details class="controls-system" open={!!filters.search}>
                              <summary>{t("boc.controls.systemAgents")}</summary>
                              <p>{t("boc.controls.systemAgentsHint")}</p>
                              <div class="controls-cards">
                                <TableHeader kind={kind} t={t} />
                                <For each={items().filter(internalAgent)}>{row}</For>
                              </div>
                            </details>
                          </Show>
                        </section>
                      </Show>
                    )
                  }}
                </For>
                <Show when={filtered().some((item) => !item.present)}>
                  <details class="rounded-lg border border-v2-border-border-base p-3">
                    <summary class="cursor-pointer text-13-medium">{t("boc.bergflow.orphans")}</summary>
                    <For each={filtered().filter((item) => !item.present)}>
                      {(item) => (
                        <ControlRow
                          item={item}
                          origin={origin(item)}
                          t={t}
                          disabled={disabled()}
                          pending={view.pending === item.key}
                          error={view.rowError?.key === item.key ? view.rowError.error : undefined}
                          operations={view.snapshot?.info.operations ?? []}
                          canConnect={!!host.connectMcp}
                          edit={() => edit("project", item)}
                          change={(action, enabled) => void preserveFocus(() => control.mutate(item, action, enabled))}
                        />
                      )}
                    </For>
                  </details>
                </Show>
                <Show when={filtered().length === 0}>
                  <div class="flex flex-col items-center gap-3 py-10 text-v2-text-text-muted">
                    <p>{t(view.snapshot?.items.length ? "boc.bergflow.noMatches" : "boc.bergflow.empty")}</p>
                    <Show when={filters.search || filters.category !== "all"}>
                      <Button variant="outline" onClick={clearFilters}>
                        {t("boc.bergflow.clearFilters")}
                      </Button>
                    </Show>
                  </div>
                </Show>
                <details class="controls-scope-details text-12-regular text-v2-text-text-muted">
                  <summary>{t("boc.controls.scopeDetails")}</summary>
                  <p>{t("boc.controls.scope")}</p>
                  <p>{t("boc.bergflow.scope.instruction")}</p>
                  <p>{t("boc.bergflow.running")}</p>
                  <p>
                    {t("boc.bergflow.version", {
                      version: view.snapshot?.info.version ?? "",
                      protocol: view.snapshot?.info.protocol ?? 1,
                    })}{" "}
                    ·{" "}
                    {t(
                      view.snapshot?.info.source === "unknown"
                        ? "boc.bergflow.sourceUnknown"
                        : `boc.bergflow.${view.snapshot?.info.source ?? "bundled"}`,
                    )}
                  </p>
                </details>
              </Show>
            </Show>
          </Show>
        </div>
      </div>
      <Show when={editor.open && view.selection}>
        <Show
          when={editor.source}
          keyed
          fallback={
            <ConfigurationEditor
              host={host}
              selection={view.selection!}
              scope={editor.scope}
              item={editor.item}
              add={editor.add}
              t={t}
              close={() => setEditor("open", false)}
              saved={() => void control.refresh()}
              agents={view.snapshot?.items.filter((item) => item.kind === "agent") ?? []}
              instructions={view.snapshot?.items.filter((item) => item.kind === "instruction") ?? []}
              editSource={(item) => edit(editor.scope, item)}
              createSource={
                view.snapshot?.info.operations.includes("createSource")
                  ? (kind, scope) => setEditor({ source: kind, scope, item: undefined })
                  : undefined
              }
            />
          }
        >
          {(kind) => (
            <SourceEditor
              host={host}
              selection={view.selection!}
              scope={editor.scope}
              kind={kind}
              item={editor.item}
              t={t}
              canDelete={view.snapshot?.info.operations.includes("deleteSource") ?? false}
              skills={view.snapshot?.items.filter((item) => item.kind === "skill") ?? []}
              close={() => setEditor("open", false)}
              saved={() => void control.refresh()}
            />
          )}
        </Show>
      </Show>
    </main>
  )
}

function TableHeader(props: { kind: ControlItem["kind"]; t: BocTranslator }) {
  return (
    <div class="controls-table-head" data-kind={props.kind}>
      <span>{props.t("boc.controls.column.name")}</span>
      <span>{props.t("boc.controls.column.source")}</span>
      <Show when={props.kind === "agent"}>
        <span class="controls-cell-model">{props.t("boc.controls.editor.model")}</span>
      </Show>
      <span class="controls-column-actions">{props.t("boc.controls.column.actions")}</span>
      <span>{props.t("boc.controls.column.enabled")}</span>
    </div>
  )
}

function ControlRow(props: {
  item: ControlItem
  origin: ReturnType<typeof controlOrigin>
  t: BocTranslator
  disabled: boolean
  pending: boolean
  error?: ControlError | undefined
  operations: readonly string[]
  edit: () => void
  canConnect: boolean
  change: (action: "set" | "clear" | "retry" | "connect", enabled?: boolean) => void
}) {
  const statusID = createUniqueId()
  const [row, setRow] = createStore({ expanded: false })
  const desired = () => props.item.override ?? props.item.defaultEnabled ?? props.item.effective === "enabled"
  const applying = () => props.pending || props.item.application === "pending"
  const showStatus = () => applying() || props.item.application === "failed" || props.item.effective === "unknown"
  return (
    <article class="controls-card" aria-busy={applying()} data-kind={props.item.kind}>
      <div class="controls-table-row">
        <div class="controls-cell-name">
          <h3 aria-label={props.item.name}>
            <Tooltip value={props.t(`boc.bergflow.origin.${props.origin}`)}>
              <span
                class="controls-origin"
                data-origin={props.origin}
                role="img"
                aria-label={props.t(`boc.bergflow.origin.${props.origin}`)}
              >
                <Icon name={originIcons[props.origin]} size="small" />
              </span>
            </Tooltip>
            <button
              type="button"
              aria-expanded={row.expanded}
              aria-controls={`${statusID}-details`}
              class="controls-name-button"
              onClick={() => setRow("expanded", !row.expanded)}
            >
              <bdi>{props.item.name}</bdi>
              <Icon name="chevron-down" size="small" />
            </button>
            <Show when={props.item.defaultAgent}>
              <span class="controls-default-mark" title={props.t("boc.controls.editor.defaultAgent")}>
                {props.t("boc.controls.defaultBadge")}
              </span>
            </Show>
          </h3>
        </div>
        <div class="controls-cell-origin">{props.t(`boc.controls.origin.${props.origin}`)}</div>
        <Show when={props.item.kind === "agent"}>
          <div class="controls-cell-model" title={props.item.model ?? props.t("boc.controls.model.default")}>
            <bdi dir="ltr">
              {props.item.model?.slice((props.item.model.indexOf("/") ?? -1) + 1) ??
                props.t("boc.controls.model.default")}
            </bdi>
          </div>
        </Show>
        <div class="controls-row-actions">
          <Show
            when={
              props.canConnect &&
              props.item.kind === "mcp" &&
              props.item.effective === "enabled" &&
              (props.item.availability === "needs_auth" || props.item.availability === "failed")
            }
          >
            <Button variant="outline" size="small" disabled={props.disabled} onClick={() => props.change("connect")}>
              {props.t(props.item.availability === "needs_auth" ? "boc.controls.signIn" : "boc.controls.connect")}
            </Button>
          </Show>
          <Show when={props.item.override !== null && props.operations.includes("clearOverride")}>
            <Tooltip value={props.t("boc.bergflow.reset")}>
              <Button
                variant="ghost"
                size="small"
                aria-label={props.t("boc.bergflow.reset")}
                disabled={props.disabled}
                onClick={() => props.change("clear")}
              >
                <Icon name="reset" size="small" />
              </Button>
            </Tooltip>
          </Show>
          <Show
            when={
              props.operations.includes("getConfiguration") &&
              (props.item.kind === "agent" ||
                props.item.kind === "mcp" ||
                ((props.item.kind === "skill" || props.item.kind === "instruction") &&
                  props.origin !== "system" &&
                  props.origin !== "plugin" &&
                  props.operations.includes("getSource")))
            }
          >
            <Button variant="ghost" size="small" disabled={props.disabled} onClick={props.edit}>
              {props.t(
                (props.item.kind === "agent" || props.item.kind === "mcp") &&
                  (props.origin === "global" || props.origin === "system")
                  ? "boc.controls.customize"
                  : "boc.controls.edit",
              )}
            </Button>
          </Show>
        </div>
        <div class="controls-cell-toggle">
          <Show
            when={props.item.mutable && props.operations.includes("setEnabled")}
            fallback={
              <Tooltip
                value={props.t(
                  props.item.kind === "instruction" && props.origin === "global"
                    ? "boc.controls.alwaysIncluded"
                    : "boc.bergflow.readOnly",
                )}
              >
                <span class="controls-readonly" aria-label={props.t("boc.bergflow.readOnly")}>
                  —
                </span>
              </Tooltip>
            }
          >
            <Switch
              hideLabel
              checked={desired()}
              disabled={props.disabled || applying()}
              onChange={(enabled) => props.change("set", enabled)}
              aria-describedby={showStatus() ? statusID : undefined}
            >
              {props.item.name}
            </Switch>
          </Show>
        </div>
      </div>
      <Show when={showStatus()}>
        <p id={statusID} class="controls-row-feedback" role="status">
          {props.t(
            applying()
              ? "boc.bergflow.applying"
              : props.item.application === "failed"
                ? "boc.bergflow.savedPending"
                : "boc.bergflow.unknown",
          )}
        </p>
      </Show>
      <Show when={props.item.kind === "mcp" && ["needs_auth", "pending", "failed"].includes(props.item.availability)}>
        <p class="controls-row-feedback">
          {props.t(`boc.bergflow.availability.${props.item.availability as "needs_auth" | "pending" | "failed"}`)}
        </p>
      </Show>
      <Show when={props.error}>
        <p role="alert" class="mt-2 text-12-regular">
          {props.t(`boc.bergflow.error.${props.error ?? "unknown"}`)}
        </p>
      </Show>
      <Show when={row.expanded}>
        <div id={`${statusID}-details`} class="controls-row-details">
          <Show when={props.item.description}>
            <p class="whitespace-pre-wrap break-words">{props.item.description}</p>
          </Show>
          <p class="break-all">
            {props.t("boc.bergflow.id")}: <bdi dir="ltr">{props.item.id}</bdi>
          </p>
          <p class="break-all">
            {props.t("boc.bergflow.source")}:{" "}
            <bdi dir="ltr">{props.item.source || props.t("boc.bergflow.sourceUnknown")}</bdi>
          </p>
          <p>{props.t(props.item.override === null ? "boc.bergflow.default" : "boc.bergflow.override")}</p>
          <Show when={props.item.model}>
            <p>
              {props.t("boc.controls.editor.model")}: <bdi dir="ltr">{props.item.model}</bdi>
            </p>
          </Show>
          <Show when={props.item.reason}>{(reason) => <p>{props.t(`boc.bergflow.reason.${reason()}`)}</p>}</Show>
          <p>{props.t(`boc.bergflow.effect.${props.item.effect}`)}</p>
          <div class="flex flex-wrap gap-2">
            <Show
              when={
                props.item.mutable && props.item.application === "failed" && props.operations.includes("retryApply")
              }
            >
              <Button variant="outline" size="small" disabled={props.disabled} onClick={() => props.change("retry")}>
                {props.t("boc.bergflow.retry")}
              </Button>
            </Show>
          </div>
        </div>
      </Show>
    </article>
  )
}

async function preserveFocus(operation: () => Promise<void>) {
  const focused = document.activeElement
  await operation()
  if (focused instanceof HTMLElement && focused.isConnected && document.activeElement === document.body) focused.focus()
}
