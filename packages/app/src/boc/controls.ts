import { controls, type BergflowHost } from "@boc/extensions/bergflow"
import { createBocTranslator } from "@boc/extensions/renderer"
import { Schema } from "effect"
import { useNavigate } from "@solidjs/router"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection, serverName, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useCurrentRoute } from "@/shell/state/layout"
import { showToast } from "@/shell/notifications/toast"

const preferences = Persistence.struct({
  selection: Persistence.optional(
    Schema.Struct({ server: Schema.String, project: Schema.String, directory: Schema.String }),
  ),
})

export function createBocControls(): BergflowHost {
  const servers = useServers()
  const global = useGlobal()
  const route = useCurrentRoute()
  const navigate = useNavigate()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const [saved, setSaved, , ready] = persisted(Persist.window("boc.bergflow"), preferences, {})
  return {
    servers: () =>
      servers.visible.map((server) => {
        const ctx = global.ensureServerCtx(server)
        const projects = new Map(
          [...ctx.projects.list(), ...ctx.sync.data.project].map((project) => [project.worktree, project]),
        )
        return {
          key: ServerConnection.key(server),
          name: serverName(server),
          globalDirectories: [
            ctx.sync.data.path.config,
            ...(ctx.sync.data.path.home
              ? [`${ctx.sync.data.path.home}/.agents`, `${ctx.sync.data.path.home}/.claude`]
              : []),
          ].filter(Boolean),
          projects: [...projects.values()].map((project) => ({
            directory: project.worktree,
            name: project.name ?? project.worktree,
            locations: [
              ...new Set([project.worktree, ...(project.worktrees ?? []).map((worktree) => worktree.directory)]),
            ],
          })),
        }
      }),
    initial: async () => {
      await ready.promise
      return saved.selection
    },
    remember: (selection) => setSaved("selection", selection),
    connect: (key) => {
      const server = servers.list.find((server) => ServerConnection.key(server) === key)
      if (!server) return
      const sdk = global.ensureServerCtx(server).sdk
      return {
        client: () => sdk.api.rpc(controls),
        identity: () => sdk.api,
        status: sdk.connection.status,
        attempt: sdk.connection.attempt,
        diagnose: async (directory, signal) =>
          (await sdk.api.plugin.list({ location: { directory } }, { signal })).data.find(
            (plugin) => plugin.id === "bergflow",
          )?.state.status,
        subscribe: (changed) =>
          sdk.event.listen((event) => {
            if (event.type === "rpc.bergflow.control.v1.changed") changed(event.data)
          }),
      }
    },
    async openSession() {
      const current = route()
      if (current.type !== "session") {
        navigate("/boc/bergflow")
        return
      }
      const server = servers.list.find((server) => ServerConnection.key(server) === current.server)
      if (!server) return
      const ctx = global.ensureServerCtx(server)
      try {
        const session = await ctx.sdk.api.session.get({ sessionID: current.sessionId })
        const project = ctx.sync.data.project.find((project) => project.id === session.projectID)
        if (!project) throw new Error("Project is unavailable")
        setSaved("selection", {
          server: current.server,
          project: project.worktree,
          directory: session.location.directory,
        })
        navigate(
          `/boc/bergflow?${new URLSearchParams({ server: current.server, project: project.worktree, directory: session.location.directory })}`,
        )
      } catch {
        showToast({ title: t("boc.bergflow.contextFailed"), variant: "error" })
      }
    },
  }
}
