import type { SessionInfo } from "@opencode-ai/client/promise"
import { usePlatform } from "@/runtime/platform/platform"
import { useGlobal } from "@/runtime/server/runtime"
import type { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { Show } from "solid-js"
import { EnvironmentContextMenuItems, environmentTarget } from "./view"

export function BocEnvironmentTabMenu(props: {
  server?: ServerConnection.Any
  session?: SessionInfo
  project?: LocalProject
  returnFocus?: () => void
}) {
  const global = useGlobal()
  const platform = usePlatform()
  const target = () =>
    environmentTarget({
      server: props.server,
      sdk: props.server ? global.ensureServerCtx(props.server).sdk : undefined,
      project: props.project,
      session: props.session,
      os: platform.os,
    })
  return <Show when={target()} keyed>{(value) => <EnvironmentContextMenuItems target={value} returnFocus={props.returnFocus} />}</Show>
}
