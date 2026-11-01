import { createQuery } from "@tanstack/solid-query"
import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"

export function BocWorktreeOrigin(props: { session: MountedSession }) {
  const ctx = usePlugin()

  const base = createQuery(() => ({
    queryKey: ["boc", "worktree-base", props.session.server.id, props.session.directory],
    enabled: props.session.server.connected && !props.session.local && !!props.session.project?.vcs,
    retry: false,
    queryFn: async (query) => {
      const location = { directory: props.session.directory }
      const server = props.session.server
      const signal = AbortSignal.any([query.signal, ctx.signal])

      const origin = await server.client.vcs
        .base({ location }, { signal })
        .then((result) => result.data)
        .catch(() => null)

      if (signal.aborted || origin) return origin

      await server.client.vcs.get({ location }, { signal }).catch(() => undefined)

      if (signal.aborted) return null

      return server.client.vcs
        .base({ location }, { signal })
        .then((result) => result.data)
        .catch(() => null)
    },
  }))

  return (
    <Show when={base.data?.source === "reflog" && base.data.name}>
      {(branch) => (
        <div class="session-summary-row">
          <Icon name="branch-out" class="shrink-0 text-v2-icon-icon-muted" />
          <span class="shrink-0 text-v2-text-text-muted">{ctx.t("session.summary.createdFrom")}:</span>
          <bdi dir="auto" class="min-w-0 truncate">
            {branch()}
          </bdi>
        </div>
      )}
    </Show>
  )
}
