import { createBocTranslator, useBocDesktop, type BocHost } from "@boc/extensions/renderer"
import { useLanguage } from "@/runtime/i18n/language"
import { serverName, ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useTabs } from "@/shell/tabs/tabs"
import { showToast } from "@/shell/notifications/toast"

export function createBocSessions(): BocHost["sessions"] {
  const desktop = useBocDesktop()
  const servers = useServers()
  const global = useGlobal()
  const tabs = useTabs()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  if (!desktop) return

  return {
    projects() {
      return servers.visible.flatMap((conn) =>
        global
          .ensureServerCtx(conn)
          .projects.list()
          .map((project) => ({
            server: ServerConnection.key(conn),
            directory: project.worktree,
            label: `${serverName(conn)} — ${project.worktree}`,
          })),
      )
    },
    async start(input) {
      const conn = servers.visible.find((item) => ServerConnection.key(item) === input.target.server)
      if (!conn) throw new Error(t("boc.jira.sessions.projectUnavailable"))
      const ctx = global.ensureServerCtx(conn)
      const directory = ctx.projects.list().find((project) => project.worktree === input.target.directory)?.worktree
      if (!directory) throw new Error(t("boc.jira.sessions.projectUnavailable"))
      const tab = await tabs.newDraft({ server: ServerConnection.key(conn), directory }, input.prompt, input.model)
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
