import { createBocTranslator } from "@boc/extensions/renderer"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { createEffect, onCleanup, Show, untrack, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useGlobal } from "@/runtime/server/runtime"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { environmentApi } from "./api"
import { useEnvironmentProjectSettings } from "./settings-store"
import { useEnvironmentResource } from "./store"

export function worktreeRing(environment?: BocEnvironment.State, unavailable = false) {
  if (unavailable || !environment?.availability.available) return "unknown"
  if (environment.stack.status === "unconfigured") return "unconfigured"
  if (environment.stack.status !== "configured") return "unknown"
  if (environment.containers.status === "running") return "running"
  if (environment.containers.status === "partial") return "partial"
  if (environment.containers.status === "stopped" || environment.containers.status === "absent") return "stopped"
  return "unknown"
}

export function BocWorktreeRing(
  props: ParentProps<{
    worktree: boolean
    visible: boolean
    server?: ServerConnection.Any
    project?: LocalProject
    directory?: string
  }>,
) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const [view, setView] = createStore<{
    state: ReturnType<typeof worktreeRing> | "worktree"
    running: number
    total: number
  }>({ state: "worktree", running: 0, total: 0 })
  const scope = () =>
    props.worktree &&
    props.visible &&
    props.server &&
    ServerConnection.local(props.server) &&
    props.project?.id &&
    props.directory &&
    platform.os !== "windows"
      ? JSON.stringify([ServerConnection.key(props.server), props.project.id, props.directory])
      : undefined
  const label = () =>
    view.state === "running" || view.state === "partial"
      ? t("boc.environments.ring.containers", { running: view.running, total: view.total })
      : t(`boc.environments.ring.${view.state}`)

  return (
    <div
      class="contents"
      data-boc-worktree-state={props.worktree ? view.state : undefined}
      title={props.worktree ? label() : undefined}
    >
      <Show when={scope()} keyed>
        {(_scope) => {
          const server = props.server
          const project = props.project
          const directory = props.directory
          if (!server || !project || !directory) return null
          return (
            <WatchWorktree
              server={server}
              project={project}
              directory={directory}
              onState={(state, environment) =>
                setView({
                  state,
                  running: environment?.containers.running ?? 0,
                  total: environment?.containers.total ?? 0,
                })
              }
            />
          )
        }}
      </Show>
      {props.children}
    </div>
  )
}

function WatchWorktree(props: {
  server: ServerConnection.Any
  project: LocalProject
  directory: string
  onState: (state: ReturnType<typeof worktreeRing> | "worktree", environment?: BocEnvironment.State) => void
}) {
  const global = useGlobal()
  const platform = usePlatform()
  const sdk = global.ensureServerCtx(props.server).sdk
  const settings = useEnvironmentProjectSettings({
    scope: sdk.scope,
    projectDirectory: props.project.worktree,
    platform,
  })
  const resource = useEnvironmentResource({
    server: ServerConnection.key(props.server),
    projectID: props.project.id ?? "",
    directory: props.directory,
    api: () => environmentApi(sdk.api),
  })
  createEffect(() => {
    if (!settings.ready() || !settings.settings.enabled || sdk.connection.status() !== "connected") return
    onCleanup(untrack(() => resource.watchStatus()))
  })
  createEffect(() => {
    const environment = resource.state.environment
    props.onState(
      !settings.ready() || !settings.settings.enabled
        ? "worktree"
        : worktreeRing(
            environment,
            resource.state.failed || resource.state.stale || sdk.connection.status() !== "connected",
          ),
      environment,
    )
  })
  return null
}
