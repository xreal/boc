import { Icon } from "@opencode/ui/icon"
import { Tooltip } from "@opencode/ui/tooltip"
import { createQuery } from "@tanstack/solid-query"
import { createEffect, createMemo, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useData, useServer } from "@/runtime/server/current"
import { useSessionLayout } from "@/session/session-layout"
import { projectForSession } from "@/shell/layout/helpers"
import { isWorkspaceDirectory, sameDirectory } from "@/workspaces/paths"

export function BocWorktreeBaseBranch() {
  const server = useServer()
  const data = useData()
  const language = useLanguage()
  const layout = useSessionLayout()
  const session = createMemo(() => (layout.params.id ? data.session.get(layout.params.id) : undefined))
  const project = createMemo(() => {
    const current = session()
    if (!current) return
    return (
      projectForSession(current, server.ctx.projects.list()) ?? projectForSession(current, server.ctx.sync.data.project)
    )
  })
  createEffect(() => {
    const current = session()
    const root = project()
    if (!current || !root?.vcs || sameDirectory(root.worktree, current.location.directory)) return
    void server.ctx.sync.worktrees.load(root.worktree)
  })
  const target = createMemo(() => {
    const current = session()
    if (!current || !isWorkspaceDirectory(project(), current.location.directory)) return
    return current.location.directory
  })
  const base = createQuery(() => ({
    queryKey: [server.ctx.sdk.scope, "boc", "worktree-base", target()],
    enabled: server.ctx.sdk.connection.status() === "connected" && !!target(),
    retry: false,
    queryFn: async () => {
      const directory = target()
      if (!directory) return null
      const base = await server.ctx.sdk.api.vcs
        .base({ location: { directory } })
        .then((result) => result.data)
        .catch(() => null)
      if (base) return base
      await server.ctx.sdk.api.vcs.get({ location: { directory } }).catch(() => undefined)
      return server.ctx.sdk.api.vcs
        .base({ location: { directory } })
        .then((result) => result.data)
        .catch(() => null)
    },
  }))
  const label = createMemo(() => {
    if (base.data?.source !== "reflog") return
    return language.t("session.new.workspace.fromBranch", { branch: base.data.name })
  })

  return (
    <Show when={label()}>
      {(value) => (
        <Tooltip placement="bottom" value={value()} class="mx-1 flex min-w-0 items-center">
          <div
            data-boc-worktree-base-branch
            class="flex h-7 min-w-0 max-w-40 items-center gap-1.5 rounded-md bg-v2-background-bg-layer-02 px-2 text-[13px] font-[440] leading-[var(--line-height-compact)] text-v2-text-text-faint"
          >
            <Icon name="branch-out" size="small" class="shrink-0 text-v2-icon-icon-muted" />
            <bdi dir="auto" class="truncate">
              {value()}
            </bdi>
          </div>
        </Tooltip>
      )}
    </Show>
  )
}
