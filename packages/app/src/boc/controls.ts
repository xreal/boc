import { controls, type ControlsHost } from "@boc/extensions/controls"
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
import { usePlatform } from "@/runtime/platform/platform"

const preferences = Persistence.struct({
  selection: Persistence.optional(
    Schema.Struct({ server: Schema.String, project: Schema.String, directory: Schema.String }),
  ),
})

export function createBocControls(): ControlsHost {
  const servers = useServers()
  const global = useGlobal()
  const route = useCurrentRoute()
  const navigate = useNavigate()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  // Keep the previous preference key so existing window selections survive the rename.
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
              ? [
                  `${ctx.sync.data.path.home}/.agents`,
                  `${ctx.sync.data.path.home}/.claude`,
                  `${ctx.sync.data.path.home}/.opencode`,
                ]
              : []),
          ].filter(Boolean),
          projects: [...projects.values()].map((project) => ({
            directory: project.worktree,
            name: project.name ?? project.worktree.split(/[\\/]/).filter(Boolean).at(-1) ?? project.worktree,
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
    async models(selection, scope) {
      const server = servers.list.find((server) => ServerConnection.key(server) === selection.server)
      if (!server) throw new Error("boc.controls.server_unavailable")
      const result = await global
        .ensureServerCtx(server)
        .sdk.api.model.list(scope === "project" ? { location: { directory: selection.directory } } : {})
      return result.data
        .filter((model) => model.enabled)
        .flatMap((model) => [
          { id: `${model.providerID}/${model.id}`, name: model.name, provider: model.providerID },
          ...model.variants.map((variant) => ({
            id: `${model.providerID}/${model.id}#${variant.id}`,
            name: `${model.name} · ${variant.id}`,
            provider: model.providerID,
          })),
        ])
    },
    async connectMcp(selection, id) {
      const server = servers.list.find((server) => ServerConnection.key(server) === selection.server)
      if (!server) throw new Error("boc.controls.server_unavailable")
      const api = global.ensureServerCtx(server).sdk.api
      const location = { directory: selection.directory }
      const mcp = (await api.mcp.list({ location })).data.find((item) => item.name === id)
      if (!mcp) throw new Error("boc.controls.mcp_unavailable")
      if (mcp.status.status === "connected") return
      if (mcp.status.status !== "needs_auth") {
        await api.mcp.connect({ server: id, location })
        return
      }
      if (!mcp.integrationID) throw new Error("boc.controls.mcp_auth_unavailable")
      const integration = await api.integration.get({ integrationID: mcp.integrationID, location })
      const method = integration.data?.methods.find((item) => item.type === "oauth" && !item.form?.length)
      if (!method || method.type !== "oauth") throw new Error("boc.controls.mcp_auth_form_required")
      const attempt = await api.integration.oauth.connect({
        integrationID: mcp.integrationID,
        methodID: method.id,
        location,
      })
      platform.openExternal(attempt.data.url)
    },
    connect: (key) => {
      const server = servers.list.find((server) => ServerConnection.key(server) === key)
      if (!server) return
      const sdk = global.ensureServerCtx(server).sdk
      return {
        client: () => sdk.api.rpc(controls),
        identity: () => sdk.api,
        status: sdk.connection.status,
        attempt: sdk.connection.attempt,
        subscribe: (changed) =>
          sdk.event.listen((event) => {
            if (event.type === "rpc.boc.controls.v1.changed") changed(event.data)
          }),
      }
    },
    async openSession() {
      const current = route()
      if (current.type !== "session") {
        navigate("/boc/controls")
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
          `/boc/controls?${new URLSearchParams({ server: current.server, project: project.worktree, directory: session.location.directory })}`,
        )
      } catch {
        showToast({ title: t("boc.bergflow.contextFailed"), variant: "error" })
      }
    },
  }
}
