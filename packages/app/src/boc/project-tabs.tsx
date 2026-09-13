import { createEffect, createMemo, For, on, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Schema } from "effect"
import { createBocTranslator } from "@boc/extensions/renderer"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { SessionTransfer } from "@opencode/schema/session-transfer"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection, serverName } from "@/runtime/server/registry"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { type LocalProject } from "@/shell/state/layout"
import { displayName, errorMessage, projectForSession } from "@/shell/layout/helpers"
import { showToast } from "@/shell/notifications/toast"
import { tabKey, useTabs, type Tab } from "@/shell/tabs/tabs"
import { isProjectDirectory, isWorkspaceDirectory } from "@/workspaces/paths"
import { pathKey } from "@/workspaces/path-key"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { Persistence } from "@/runtime/persistence/schema"
import { adjacentTabKey } from "@/shell/titlebar/tab-order"
import { fileManagerApp } from "@/home/projects/file-manager"
import { useSettingsSurface } from "@/settings/surface"
import { BocWorktreeRing } from "./environments/worktree-ring"
import "./project-tabs.css"

const preferences = Persistence.struct({
  order: Persistence.array(Schema.String),
  collapsed: Persistence.record(Schema.Boolean),
})

type ProjectGroup = {
  key: string
  name: string
  path: string
  server: ServerConnection.Key
  connection?: ServerConnection.Any
  project?: LocalProject
  worktree: boolean
  directory?: string
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
  const platform = usePlatform()
  const settings = useSettingsSurface()
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
            connection: conn,
            project,
            worktree: !!directory && isWorkspaceDirectory(project, directory),
            directory,
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

  const projectDirectories = (project: LocalProject) => [project.worktree, ...(project.sandboxes ?? [])]
  const canRevealProject = (group: ProjectGroup) =>
    !!group.project &&
    !!group.connection &&
    platform.platform === "desktop" &&
    !!platform.openPath &&
    ServerConnection.local(group.connection)

  const importSession = (group: ProjectGroup) => {
    const server = group.connection
    const project = group.project
    if (!platform.openAttachmentPickerDialog || !server || !project) return

    void platform
      .openAttachmentPickerDialog(
        {
          title: language.t("command.session.import"),
          accept: ["application/json"],
          extensions: ["json"],
        },
        async (file) => {
          const data = await Schema.decodeUnknownPromise(Schema.fromJsonString(SessionTransfer.Data))(await file.text())
          const ctx = global.ensureServerCtx(server)
          // The generated client preserves the transfer envelope as a narrower input type.
          // SessionTransfer.Data is the canonical runtime schema for this payload.
          // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
          const imported = await ctx.sdk.api.session.import({
            ...Schema.encodeSync(SessionTransfer.Data)(data),
            location: { directory: project.worktree },
          } as Parameters<typeof ctx.sdk.api.session.import>[0])
          void ctx.data.session.message.sync(imported.id).catch(() => undefined)
          const tab = tabs.addSessionTab({ server: ServerConnection.key(server), sessionId: imported.id })
          tabs.select(tab)
          ctx.data.session.remember(imported)
          ctx.projects.open(project.worktree)
          ctx.projects.touch(project.worktree)
        },
      )
      .catch((cause: unknown) => {
        showToast({
          title: language.t("common.requestFailed"),
          description: errorMessage(cause, language.t("common.requestFailed")),
        })
      })
  }

  const editProject = (group: ProjectGroup) => {
    const server = group.connection
    const project = group.project
    if (!server || !project) return
    settings.openProject({
      server: ServerConnection.key(server),
      project: project.worktree,
    })
  }

  const revealProject = (group: ProjectGroup) => {
    if (!group.project || !group.connection || !platform.openPath || !canRevealProject(group)) return
    platform.openPath(group.project.worktree).catch((cause: unknown) =>
      showToast({
        title: language.t("common.requestFailed"),
        description: errorMessage(cause, language.t("common.requestFailed")),
      }),
    )
  }

  const unseenCount = (group: ProjectGroup) => {
    if (!group.connection || !group.project) return 0
    const notification = global.ensureServerCtx(group.connection).notification
    return projectDirectories(group.project).reduce(
      (total, directory) => total + notification.project.unseenCount(directory),
      0,
    )
  }

  const clearNotifications = (group: ProjectGroup) => {
    if (!group.connection || !group.project) return
    const notification = global.ensureServerCtx(group.connection).notification
    projectDirectories(group.project)
      .filter((directory) => notification.project.unseenCount(directory) > 0)
      .forEach((directory) => notification.project.markViewed(directory))
  }

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
    canImportSession: (project: ProjectGroup) =>
      !!platform.openAttachmentPickerDialog && !!project.connection && !!project.project,
    importSession,
    editProject,
    canRevealProject,
    revealProject,
    unseenCount,
    clearNotifications,
    closeProject: (project: ProjectGroup) => {
      if (!project.connection || !project.path) return
      global.ensureServerCtx(project.connection).projects.close(project.path)
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
  const [menu, setMenu] = createStore({ open: undefined as string | undefined })
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
                  <Show when={project().project && project().connection}>
                    <BocProjectMenu
                      group={project()}
                      groups={props.groups}
                      open={menu.open === project().key}
                      onOpenChange={(open) => setMenu("open", open ? project().key : undefined)}
                    />
                  </Show>
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
            <BocWorktreeRing
              worktree={!!(props.enabled && props.groups.projects().get(tabKey(tab))?.worktree)}
              visible={!props.enabled || props.groups.visible(tab)}
              server={props.groups.projects().get(tabKey(tab))?.connection}
              project={props.groups.projects().get(tabKey(tab))?.project}
              directory={props.groups.projects().get(tabKey(tab))?.directory}
            >
              <div
                data-slot={props.enabled ? "boc-project-tab" : undefined}
                data-worktree={props.enabled && props.groups.projects().get(tabKey(tab))?.worktree ? "" : undefined}
                hidden={props.enabled && !props.groups.visible(tab)}
                classList={{ contents: !props.enabled, "min-w-0 shrink-0 ps-5 empty:hidden": props.enabled }}
              >
                {props.children(tab)}
              </div>
            </BocWorktreeRing>
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

function BocProjectMenu(props: {
  group: ProjectGroup
  groups: ReturnType<typeof createBocProjectTabs>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const language = useLanguage()
  const platform = usePlatform()
  return (
    <div
      class="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[menu=true]:opacity-100"
      data-menu={props.open}
    >
      <Menu gutter={6} modal={false} placement="bottom-end" open={props.open} onOpenChange={props.onOpenChange}>
        <Menu.Trigger
          as={IconButton}
          data-action="boc-project-menu"
          variant="ghost-muted"
          size="small"
          icon={<Icon name="outline-dots" />}
          aria-label={language.t("common.moreOptions")}
          title={language.t("common.moreOptions")}
        />
        <Menu.Portal>
          <Menu.Content>
            <Menu.Item onSelect={() => props.groups.newSession(props.group)}>
              {language.t("command.session.new")}
            </Menu.Item>
            <Show when={props.groups.canImportSession(props.group)}>
              <Menu.Item onSelect={() => props.groups.importSession(props.group)}>
                {language.t("command.session.import")}
              </Menu.Item>
            </Show>
            <Menu.Item onSelect={() => props.groups.editProject(props.group)}>
              {language.t("dialog.project.edit.title")}
            </Menu.Item>
            <Show when={props.groups.canRevealProject(props.group)}>
              <Menu.Item onSelect={() => props.groups.revealProject(props.group)}>
                {language.t(
                  fileManagerApp(platform.platform === "desktop" ? (platform.os ?? "unknown") : "unknown").actionLabel,
                )}
              </Menu.Item>
            </Show>
            <Menu.Item
              disabled={props.groups.unseenCount(props.group) === 0}
              onSelect={() => props.groups.clearNotifications(props.group)}
            >
              {language.t("sidebar.project.clearNotifications")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={() => props.groups.closeProject(props.group)}>{language.t("common.close")}</Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </div>
  )
}
