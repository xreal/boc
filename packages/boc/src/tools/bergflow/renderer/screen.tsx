import type { ControlItem } from "@bergflow/opencode/rpc"
import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/switch"
import { TextField } from "@opencode-ai/ui/text-field"
import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js"
import type { BocScreenProps } from "../../../registry"
import { createBocTranslator, type BocTranslator } from "../../../renderer/i18n"
import { createBergflowControls, type ControlError } from "./state"

const kinds = ["agent", "skill", "tool", "mcp", "instruction"] as const

export default function BergflowScreen(props: BocScreenProps) {
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
  const control = createBergflowControls(
    host,
    server && project && directory ? { server, project, directory } : undefined,
  )
  const view = control.view
  const [search, setSearch] = createSignal("")
  const [category, setCategory] = createSignal("all")
  const [draftServer, setDraftServer] = createSignal("")
  const selectedServer = () => view.selection?.server ?? draftServer()
  const serverInfo = () => host.servers().find((server) => server.key === selectedServer())
  const projectInfo = () => serverInfo()?.projects.find((project) => project.directory === view.selection?.project)
  const locations = () => [
    ...new Set([...(projectInfo()?.locations ?? []), ...(view.selection ? [view.selection.directory] : [])]),
  ]
  const filtered = createMemo(() => {
    const query = search().trim().toLocaleLowerCase()
    return (
      view.snapshot?.items.filter(
        (item) =>
          (category() === "all" || item.kind === category()) &&
          (!query || [item.name, item.id, item.source].some((text) => text.toLocaleLowerCase().includes(query))),
      ) ?? []
    )
  })
  const selectServer = (key: string) => {
    if (view.pending) return
    control.clear()
    setDraftServer(key)
    const server = host.servers().find((server) => server.key === key)
    const project = server?.projects.length === 1 ? server.projects[0] : undefined
    if (project) control.select({ server: key, project: project.directory, directory: project.directory })
  }
  const disabled = () => view.stale || !!view.pending
  const clearFilters = () => {
    setSearch("")
    setCategory("all")
  }
  return (
    <main data-boc-bergflow class="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto text-v2-text-text-base">
      <div class="mx-auto flex w-full max-w-[1100px] flex-col gap-5 p-4 sm:p-6">
        <header class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-20-medium">{t("boc.bergflow.title")}</h1>
          <Button
            variant="outline"
            onClick={() => void preserveFocus(control.refresh)}
            disabled={!view.selection || view.loading || !!view.pending}
          >
            {t(view.loading && view.snapshot ? "boc.bergflow.refreshing" : "boc.bergflow.refresh")}
          </Button>
        </header>
        <div class="flex flex-wrap gap-3" aria-busy={!!view.pending}>
          <label class="flex min-w-[160px] flex-1 flex-col gap-1 text-12-medium">
            {t("boc.bergflow.server")}
            <select
              aria-label={t("boc.bergflow.server")}
              class="h-9 min-w-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular"
              value={selectedServer()}
              disabled={!!view.pending}
              onChange={(event) => selectServer(event.currentTarget.value)}
            >
              <option value="">{t("boc.bergflow.selectServer")}</option>
              <For each={host.servers()}>{(server) => <option value={server.key}>{server.name}</option>}</For>
              <Show when={view.selection && !serverInfo()}>
                <option value={view.selection?.server}>{t("boc.bergflow.error.unavailable")}</option>
              </Show>
            </select>
          </label>
          <label class="flex min-w-[200px] flex-[2] flex-col gap-1 text-12-medium">
            {t("boc.bergflow.project")}
            <select
              aria-label={t("boc.bergflow.project")}
              class="h-9 min-w-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular"
              value={view.selection?.project ?? ""}
              disabled={!!view.pending || !serverInfo()}
              onChange={(event) => {
                const root = event.currentTarget.value
                if (root) control.select({ server: selectedServer(), project: root, directory: root })
              }}
            >
              <option value="">{t("boc.bergflow.selectProject")}</option>
              <For each={serverInfo()?.projects}>
                {(project) => <option value={project.directory}>{project.name}</option>}
              </For>
              <Show when={view.selection && !projectInfo()}>
                <option value={view.selection?.project}>{view.selection?.project}</option>
              </Show>
            </select>
          </label>
          <Show when={locations().length > 1}>
            <label class="flex min-w-[200px] flex-[2] flex-col gap-1 text-12-medium">
              {t("boc.bergflow.worktree")}
              <select
                aria-label={t("boc.bergflow.worktree")}
                dir="ltr"
                class="h-9 min-w-0 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular"
                value={view.selection?.directory}
                disabled={!!view.pending}
                onChange={(event) => {
                  const selection = view.selection
                  if (selection) control.select({ ...selection, directory: event.currentTarget.value })
                }}
              >
                <For each={locations()}>{(directory) => <option value={directory}>{directory}</option>}</For>
              </select>
            </label>
          </Show>
        </div>
        <Show when={view.selection}>
          <div class="flex flex-col gap-1 text-12-regular text-v2-text-text-muted">
            <p class="break-words">
              <bdi dir="ltr">{view.snapshot?.info.location.directory ?? view.selection?.directory}</bdi>
            </p>
            <p>{t("boc.bergflow.scope")}</p>
            <Show when={view.pending}>
              <p role="status">{t("boc.bergflow.contextLocked")}</p>
            </Show>
          </div>
        </Show>
        <div role="status" aria-live="polite" aria-atomic="true" class="text-13-regular">
          <Show when={view.error}>{(error) => <p>{t(`boc.bergflow.error.${error()}`)}</p>}</Show>
          <Show when={view.stale && view.snapshot}>
            <p class="mt-1 text-v2-text-text-muted">{t("boc.bergflow.stale")}</p>
          </Show>
        </div>
        <Show when={view.error === "missing" || view.error === "disabled" || view.error === "unsupported"}>
          <details class="rounded-lg border border-v2-border-border-base p-3 text-13-regular">
            <summary class="cursor-pointer">{t("boc.bergflow.admin")}</summary>
            <p class="mt-2 leading-relaxed text-v2-text-text-muted">{t("boc.bergflow.adminText")}</p>
          </details>
        </Show>
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
              <div class="flex flex-wrap items-end gap-3">
                <TextField
                  class="min-w-[200px] flex-1"
                  label={t("boc.bergflow.search")}
                  value={search()}
                  onChange={setSearch}
                  placeholder={t("boc.bergflow.search")}
                />
                <label class="flex min-w-[140px] flex-col gap-1 text-12-medium">
                  {t("boc.bergflow.filter")}
                  <select
                    class="h-9 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-2 text-13-regular"
                    value={category()}
                    onChange={(event) => setCategory(event.currentTarget.value)}
                  >
                    <option value="all">{t("boc.bergflow.all")}</option>
                    <For each={kinds}>{(kind) => <option value={kind}>{t(`boc.bergflow.${kind}`)}</option>}</For>
                  </select>
                </label>
              </div>
              <Show when={view.snapshot?.incomplete.length}>
                <p class="text-12-regular text-v2-text-text-muted">{t("boc.bergflow.partial")}</p>
              </Show>
              <For each={kinds}>
                {(kind) => {
                  const items = () => filtered().filter((item) => item.kind === kind && item.present)
                  return (
                    <Show when={items().length}>
                      <section class="min-w-0">
                        <h2 class="mb-2 flex items-center gap-2 text-14-medium">
                          {t(`boc.bergflow.${kind}`)}{" "}
                          <span class="text-12-regular text-v2-text-text-muted">{items().length}</span>
                        </h2>
                        <div class="divide-y divide-v2-border-border-base overflow-hidden rounded-lg border border-v2-border-border-base">
                          <For each={items()}>
                            {(item) => (
                              <ControlRow
                                item={item}
                                t={t}
                                disabled={disabled()}
                                pending={view.pending === item.key}
                                error={view.rowError?.key === item.key ? view.rowError.error : undefined}
                                operations={view.snapshot?.info.operations ?? []}
                                change={(action, enabled) =>
                                  void preserveFocus(() => control.mutate(item, action, enabled))
                                }
                              />
                            )}
                          </For>
                        </div>
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
                        t={t}
                        disabled={disabled()}
                        pending={view.pending === item.key}
                        error={view.rowError?.key === item.key ? view.rowError.error : undefined}
                        operations={view.snapshot?.info.operations ?? []}
                        change={(action, enabled) => void preserveFocus(() => control.mutate(item, action, enabled))}
                      />
                    )}
                  </For>
                </details>
              </Show>
              <Show when={filtered().length === 0}>
                <div class="flex flex-col items-center gap-3 py-10 text-v2-text-text-muted">
                  <p>{t(view.snapshot?.items.length ? "boc.bergflow.noMatches" : "boc.bergflow.empty")}</p>
                  <Show when={search() || category() !== "all"}>
                    <Button variant="outline" onClick={clearFilters}>
                      {t("boc.bergflow.clearFilters")}
                    </Button>
                  </Show>
                </div>
              </Show>
              <footer class="flex flex-col gap-1 border-t border-v2-border-border-base pt-4 text-12-regular text-v2-text-text-muted">
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
              </footer>
            </Show>
          </Show>
        </Show>
      </div>
    </main>
  )
}

function ControlRow(props: {
  item: ControlItem
  t: BocTranslator
  disabled: boolean
  pending: boolean
  error?: ControlError | undefined
  operations: string[]
  change: (action: "set" | "clear" | "retry", enabled?: boolean) => void
}) {
  const statusID = createUniqueId()
  const desired = () => props.item.override ?? props.item.defaultEnabled ?? props.item.effective === "enabled"
  return (
    <article class="min-w-0 p-3 sm:p-4" aria-busy={props.pending}>
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0 flex-1">
          <h3 class="break-words text-14-medium">
            <bdi>{props.item.name}</bdi>
          </h3>
          <p class="mt-1 break-words text-12-regular text-v2-text-text-muted">
            <bdi dir="auto">{props.item.source || props.t("boc.bergflow.sourceUnknown")}</bdi> ·{" "}
            {props.t(props.item.override === null ? "boc.bergflow.default" : "boc.bergflow.override")}
          </p>
          <p id={statusID} class="mt-1 text-12-regular">
            {props.pending
              ? props.t("boc.bergflow.applying")
              : props.item.application === "failed"
                ? props.t("boc.bergflow.savedPending")
                : props.t(`boc.bergflow.${props.item.effective}`)}
          </p>
          <Show
            when={
              props.item.availability === "needs_auth" ||
              props.item.availability === "pending" ||
              props.item.availability === "failed"
            }
          >
            <p class="text-12-regular text-v2-text-text-muted">
              {props.t(`boc.bergflow.availability.${props.item.availability as "needs_auth" | "pending" | "failed"}`)}
            </p>
          </Show>
          <Show when={props.item.override !== null && props.item.effective !== (desired() ? "enabled" : "disabled")}>
            <p class="text-12-regular">{props.t(desired() ? "boc.bergflow.desiredOn" : "boc.bergflow.desiredOff")}</p>
          </Show>
        </div>
        <Show when={props.item.mutable && props.operations.includes("setEnabled")}>
          <Switch
            hideLabel
            checked={desired()}
            disabled={props.disabled}
            onChange={(enabled) => props.change("set", enabled)}
            aria-describedby={statusID}
          >
            {props.item.name}
          </Switch>
        </Show>
      </div>
      <Show when={props.error}>
        <p role="alert" class="mt-2 text-12-regular">
          {props.t(`boc.bergflow.error.${props.error ?? "unknown"}`)}
        </p>
      </Show>
      <details class="mt-2 text-12-regular">
        <summary class="w-fit cursor-pointer text-v2-text-text-muted">{props.t("boc.bergflow.details")}</summary>
        <div class="mt-2 flex flex-col gap-2">
          <Show when={props.item.description}>
            <p class="whitespace-pre-wrap break-words">{props.item.description}</p>
          </Show>
          <p class="break-all">
            {props.t("boc.bergflow.id")}: <bdi dir="ltr">{props.item.id}</bdi>
          </p>
          <Show when={props.item.reason}>{(reason) => <p>{props.t(`boc.bergflow.reason.${reason()}`)}</p>}</Show>
          <p>{props.t(`boc.bergflow.effect.${props.item.effect}`)}</p>
          <div class="flex flex-wrap gap-2">
            <Show when={props.item.override !== null && props.operations.includes("clearOverride")}>
              <Button variant="outline" size="small" disabled={props.disabled} onClick={() => props.change("clear")}>
                {props.t("boc.bergflow.reset")}
              </Button>
            </Show>
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
      </details>
    </article>
  )
}

async function preserveFocus(operation: () => Promise<void>) {
  const focused = document.activeElement
  await operation()
  if (focused instanceof HTMLElement && focused.isConnected && document.activeElement === document.body) focused.focus()
}
