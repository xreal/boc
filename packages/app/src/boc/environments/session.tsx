import { projectForSession } from "@/shell/layout/helpers"
import { useSessionLayout } from "@/session/session-layout"
import { useData, useServer } from "@/runtime/server/current"
import { usePlatform } from "@/runtime/platform/platform"
import { createMemo, Show } from "solid-js"
import { EnvironmentTitlebarControl, environmentTarget } from "./view"

export function BocEnvironmentSessionControl() {
  const server = useServer()
  const data = useData()
  const platform = usePlatform()
  const layout = useSessionLayout()
  const session = createMemo(() => (layout.params.id ? data.session.get(layout.params.id) : undefined))
  const project = createMemo(() => {
    const current = session()
    return current ? projectForSession(current, server.ctx.projects.list()) : undefined
  })
  const target = createMemo(() =>
    environmentTarget({
      server: server.conn,
      sdk: server.ctx.sdk,
      project: project(),
      session: session(),
      os: platform.os,
    }),
  )
  return <Show when={target()} keyed>{(value) => <EnvironmentTitlebarControl target={value} />}</Show>
}
