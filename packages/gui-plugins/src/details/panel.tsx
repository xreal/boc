import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { Icon } from "@opencode/ui/icon"
import { Show } from "solid-js"
import { SessionServerPanel } from "./server-panel"
import { BocWorktreeOrigin } from "./boc/worktree-origin"

export type DetailsPanelProps = {
  session: MountedSession
  shown?: boolean
  mobile?: boolean
  /** Closes the popover that shows the panel, once an action opened something beside it. */
  onClose?: () => void
}

export default function SessionDetailsPanel(props: DetailsPanelProps) {
  const ctx = usePlugin()
  const branch = () => props.session.server.data.location.vcs.info({ directory: props.session.directory })?.branch.current

  return (
    <div data-component="session-summary-panel" data-mobile={props.mobile || undefined}>
      <Show when={branch()}>
        {(name) => (
          <div class="session-summary-row">
            <Icon name="branch" class="shrink-0 text-v2-icon-icon-muted" />
            <span class="shrink-0 text-v2-text-text-muted">{ctx.t("session.summary.branch")}:</span>
            <bdi dir="auto" class="min-w-0 truncate">{name()}</bdi>
          </div>
        )}
      </Show>
      <BocWorktreeOrigin session={props.session} />
      <SessionServerPanel
        session={props.session}
        directory={props.session.directory}
        shown={props.shown !== false}
        mobile={props.mobile}
        onClose={props.onClose}
      />
    </div>
  )
}
