import { createEffect, createMemo, For, on, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { createBocTranslator } from "@boc/extensions/renderer"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, serverName } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import { displayName, projectForSession } from "@/shell/layout/helpers"
import { tabKey, useTabs, type Tab } from "@/shell/tabs/tabs"
import { isProjectDirectory } from "@/workspaces/paths"
import { pathKey } from "@/workspaces/path-key"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { adjacentTabKey } from "@/shell/titlebar/tab-order"

const preferences = Persistence.struct({
  order: Persistence.array(Schema.String),
  collapsed: Persistence.record(Schema.Boolean),
})

type ProjectGroup = {
  key: string
  name: string
  path: string
  server: ServerConnection.Key
  serverLabel?: string
}

export function createBocProjectTabs(input: {
  tabs: () => Tab[]
  current: () => Tab | undefined
  enabled: () => boolean
}) {
  const global = useGlobal()
  const tabs = useTabs()
  const language = useLanguage()
  const [state, setState] = persisted(Persist.window("boc.project-tabs"), preferences, { order: [], collapsed: {} })
  const projects = createMemo(() => {
    if (!input.enabled()) return new Map<string, ProjectGroup>()
    const servers = global.servers.list()
    return new Map(
      input.tabs().map((tab) => {
        const conn = servers.find((server) => ServerConnection.key(server) === tab.server)
        const ctx = conn ? global.ensureServerCtx(conn) : undefined
        const session = tab.type === "session" ? ctx?.data.session.get(tab.sessionId) : undefined
        const directory =
          tab.type === "draft"
            ? tab.directory
            : (session?.location.directory ??
              tabs.pendingSession(tab.server, tab.sessionId)?.draft.directory ??
              tabs.info[tabKey(tab)]?.directory)
        const project = session
          ? projectForSession(session, ctx?.projects.list() ?? [])
          : ctx?.projects.list().find((project) => directory && isProjectDirectory(project, directory))
        const path = project?.worktree ?? directory
        return [
          tabKey(tab),
          {
            key: JSON.stringify([tab.server, path ? pathKey(path) : null]),
            name: path ? displayName(project ?? { worktree: path }) : language.t("session.tab.session"),
            path: path ?? "",
            server: tab.server,
            serverLabel: servers.length > 1 && conn ? serverName(conn) : undefined,
          },
        ]
      }),
    )
  })
  const groupOrder = createMemo(() => [
    ...new Set([...state.order, ...[...projects().values()].map((project) => project.key)]),
  ])
  const ordered = createMemo(() => {
    if (!input.enabled()) return input.tabs()
    const groups = new Map<string, Tab[]>()
    input.tabs().forEach((tab) => {
      const key = projects().get(tabKey(tab))!.key
      const group = groups.get(key)
      if (group) group.push(tab)
      if (!group) groups.set(key, [tab])
    })
    return groupOrder().flatMap((key) => groups.get(key) ?? [])
  })

  // A newly selected tab reveals its group; collapsing the active group itself stays possible.
  createEffect(
    on(
      input.current,
      (tab) => {
        if (!input.enabled() || !tab) return
        const project = projects().get(tabKey(tab))
        if (project && state.collapsed[project.key]) setState("collapsed", project.key, false)
      },
      { defer: true },
    ),
  )

  return {
    ordered,
    projects,
    collapsed: (key: string) => state.collapsed[key] ?? false,
    visible: (tab: Tab) => !input.enabled() || !state.collapsed[projects().get(tabKey(tab))!.key],
    toggle: (key: string) => setState("collapsed", key, !state.collapsed[key]),
    rememberOrder: () => {
      if (input.enabled()) setState("order", groupOrder())
    },
    move: (key: string, target: string, after: boolean) => {
      if (key === target) return
      const order = groupOrder().filter((item) => item !== key)
      const index = order.indexOf(target)
      if (index === -1) return
      order.splice(index + Number(after), 0, key)
      setState("order", order)
    },
    newSession: (project: ProjectGroup) => {
      if (!project.path) return
      setState("collapsed", project.key, false)
      void tabs.newDraft({ server: project.server, directory: project.path })
    },
    adjacent: (visible: string[], current: string | undefined, offset: -1 | 1) => {
      if (!input.enabled() || !current || visible.includes(current)) return adjacentTabKey(visible, current, offset)
      const all = ordered().map(tabKey)
      const index = all.indexOf(current)
      const next = [...all.slice(index + 1), ...all.slice(0, index)]
      return (offset === 1 ? next : next.reverse()).find((key) => visible.includes(key))
    },
  }
}

export function BocProjectTabList(props: {
  each: Tab[]
  visible: Tab[]
  groups: ReturnType<typeof createBocProjectTabs>
  enabled: boolean
  children: (tab: Tab) => JSX.Element
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  let listRef!: HTMLDivElement
  const [drag, setDrag] = createStore({
    source: undefined as string | undefined,
    target: undefined as { key: string; after: boolean; top: number } | undefined,
  })
  const clearDrag = () => setDrag({ source: undefined, target: undefined })

  function dropTarget(event: DragEvent) {
    const bounds = listRef.getBoundingClientRect()
    const headings = Array.from(listRef.querySelectorAll<HTMLElement>("[data-project-group]"))
    const groups = headings
      .map((heading, index) => ({
        key: heading.dataset.projectGroup!,
        top: heading.getBoundingClientRect().top,
        bottom: headings[index + 1]?.getBoundingClientRect().top ?? bounds.bottom - 12,
      }))
      .filter((group) => group.key !== drag.source)
    const before = groups.find((group) => event.clientY < (group.top + group.bottom) / 2)
    const target = before ?? groups.at(-1)
    if (!target) return
    return {
      key: target.key,
      after: !before,
      top: Math.max(0, (before ? target.top : target.bottom) - bounds.top - 2),
    }
  }
  const headings = createMemo(() => {
    const groups = new Map<string, string>()
    if (!props.enabled) return new Set<string>()
    props.visible.forEach((tab) => {
      const key = props.groups.projects().get(tabKey(tab))!.key
      if (!groups.has(key)) groups.set(key, tabKey(tab))
    })
    return new Set(groups.values())
  })

  return (
    <div
      ref={listRef}
      data-slot={props.enabled ? "boc-project-tab-list" : undefined}
      classList={{ contents: !props.enabled, "relative flex w-full min-w-0 flex-col gap-1 pb-4": props.enabled }}
      onDragOver={(event) => {
        if (!drag.source) return
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
        setDrag("target", dropTarget(event))
      }}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && listRef.contains(event.relatedTarget)) return
        setDrag("target", undefined)
      }}
      onDrop={(event) => {
        if (!drag.source) return
        event.preventDefault()
        const target = dropTarget(event)
        if (target) props.groups.move(drag.source, target.key, target.after)
        clearDrag()
      }}
    >
      <For each={props.each}>
        {(tab) => (
          <>
            <Show when={headings().has(tabKey(tab)) && props.groups.projects().get(tabKey(tab))}>
              {(project) => (
                <div
                  data-slot="boc-project-heading"
                  data-project-group={project().key}
                  class="group relative mt-4 mb-1 flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-1 first:mt-0 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted"
                  classList={{ "opacity-40": drag.source === project().key }}
                >
                  <button
                    type="button"
                    draggable="true"
                    class="flex h-7 min-w-0 flex-1 cursor-grab items-center gap-1.5 rounded-[4px] text-start hover:text-v2-text-text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-v2-border-focus active:cursor-grabbing"
                    aria-expanded={!props.groups.collapsed(project().key)}
                    aria-label={project().name}
                    title={t("boc.projectTabs.reorder")}
                    onClick={() => props.groups.toggle(project().key)}
                    onDragStart={(event) => {
                      if (!event.dataTransfer) return
                      event.dataTransfer.effectAllowed = "move"
                      event.dataTransfer.setData("application/x-boc-project-group", project().key)
                      setDrag("source", project().key)
                    }}
                    onDragEnd={clearDrag}
                    onKeyDown={(event) => {
                      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return
                      event.preventDefault()
                      const keys = [
                        ...new Set(props.visible.map((tab) => props.groups.projects().get(tabKey(tab))!.key)),
                      ]
                      const offset = event.key === "ArrowUp" ? -1 : 1
                      const target = keys[keys.indexOf(project().key) + offset]
                      if (target) props.groups.move(project().key, target, offset === 1)
                    }}
                  >
                    <Icon
                      name="chevron-down"
                      size="small"
                      classList={{ "-rotate-90": props.groups.collapsed(project().key) }}
                    />
                    <Icon name="folder" size="small" />
                    <span class="min-w-0 flex-1 truncate font-medium" dir="auto">
                      {project().name}
                    </span>
                    <Show when={project().serverLabel}>
                      <span class="max-w-20 truncate text-[11px] text-v2-text-text-faint">{project().serverLabel}</span>
                    </Show>
                  </button>
                  <IconButton
                    data-action="boc-project-new-session"
                    variant="ghost-muted"
                    size="small"
                    class="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                    icon={<Icon name="edit" />}
                    aria-label={t("boc.projectTabs.newSession", { project: project().name })}
                    title={t("boc.projectTabs.newSession", { project: project().name })}
                    disabled={!project().path}
                    onClick={() => props.groups.newSession(project())}
                  />
                </div>
              )}
            </Show>
            <div
              hidden={props.enabled && !props.groups.visible(tab)}
              classList={{ contents: !props.enabled, "min-w-0 shrink-0 ps-5 empty:hidden": props.enabled }}
            >
              {props.children(tab)}
            </div>
          </>
        )}
      </For>
      <Show when={drag.target}>
        {(target) => (
          <div
            data-slot="boc-project-drop-indicator"
            class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-v2-border-focus"
            style={{ top: `${target().top}px` }}
          />
        )}
      </Show>
    </div>
  )
}
