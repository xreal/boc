import { createBocTranslator, useBocDesktop, type BocHost } from "@boc/extensions/renderer"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useLayout } from "@/shell/state/layout"
import { useTabs } from "@/shell/tabs/tabs"
import { showToast } from "@/shell/notifications/toast"

export function createBocSessions(): BocHost["sessions"] {
  const desktop = useBocDesktop()
  const servers = useServers()
  const global = useGlobal()
  const layout = useLayout()
  const tabs = useTabs()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  if (!desktop) return

  return {
    async start(input) {
      const selection = layout.home.selection()
      const conn = servers.visible.find((item) => ServerConnection.key(item) === selection.server) ?? servers.visible[0]
      if (!conn) throw new Error(t("boc.jira.sessions.noProject"))
      const ctx = global.ensureServerCtx(conn)
      const projects = ctx.projects.list()
      const directory =
        projects.find((project) => project.worktree === selection.directory)?.worktree ??
        ctx.projects.last() ??
        projects[0]?.worktree
      if (!directory) throw new Error(t("boc.jira.sessions.noProject"))
      const tab = await tabs.newDraft({ server: ServerConnection.key(conn), directory }, input.prompt)
      await desktop.jira
        .saveSessionLink({
          issueUrl: input.issueUrl,
          title: input.title,
          draftID: tab.draftID,
          server: tab.server,
          createdAt: Date.now(),
        })
        .catch(() => {
          showToast({ title: t("boc.jira.sessions.linkFailed") })
        })
    },
    async open(server, sessionID) {
      const conn = servers.list.find((item) => ServerConnection.key(item) === server)
      if (!conn) throw new Error(t("boc.jira.sessions.unavailable"))
      const ctx = global.ensureServerCtx(conn)
      await ctx.sdk.api.session.get({ sessionID })
      const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: sessionID })
      tabs.select(tab)
    },
  }
}

export function useBocSessionLink() {
  const desktop = useBocDesktop()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  return (input: { draftID: string; server: string; sessionID: string }) =>
    desktop?.jira.promoteSessionLink(input).catch(() => {
      showToast({ title: t("boc.jira.sessions.linkFailed") })
    })
}
