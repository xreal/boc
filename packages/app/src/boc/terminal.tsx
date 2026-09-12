import {
  createBocTranslator,
  type BocHost,
  type BocTerminalInput,
} from "@boc/extensions/renderer"
import { createEffect } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useSessionLayout } from "@/session/session-layout"
import { useTerminal } from "@/session/terminal/context"
import { showToast } from "@/shell/notifications/toast"
import { findSessionTab, type SessionTab, type Tab, useTabs } from "@/shell/tabs/tabs"

let lastLocalSession: SessionTab | undefined
let pending: { target: SessionTab; input: BocTerminalInput } | undefined

export function createBocTerminal(): NonNullable<BocHost["terminal"]> {
  const tabs = useTabs()
  const servers = useServers()
  const t = createBocTranslator(useLanguage().locale)

  return {
    open(input) {
      const target = findBocTerminalTarget(tabs.store, servers.list, lastLocalSession)
      if (!target) {
        showToast({ title: t("boc.terminal.sessionRequired") })
        return
      }
      pending = { target, input }
      tabs.select(target)
    },
  }
}

export function BocTerminalRequestBridge() {
  const server = useServer()
  const tabs = useTabs()
  const layout = useSessionLayout()
  const terminal = useTerminal()
  const t = createBocTranslator(useLanguage().locale)

  createEffect(() => {
    const current = layout.params.id ? findSessionTab(tabs.store, server.key, layout.params.id) : undefined
    if (!current || current.type !== "session" || !server.isLocal) return
    lastLocalSession = current
    if (!terminal.ready() || !pending || !sameSession(pending.target, current)) return

    const request = pending
    pending = undefined
    layout.view().terminal.open()
    void terminal.new(request.input).then((created) => {
      if (created) return
      showToast({ title: t("boc.terminal.failed") })
    })
  })

  return null
}

export function findBocTerminalTarget(
  tabs: readonly Tab[],
  servers: readonly ServerConnection.Any[],
  preferred?: SessionTab,
) {
  const localServers = new Set(servers.filter(ServerConnection.local).map(ServerConnection.key))
  const available = tabs.filter(
    (tab): tab is SessionTab => tab.type === "session" && localServers.has(tab.server),
  )
  if (preferred) {
    const current = available.find((tab) => sameSession(tab, preferred))
    if (current) return current
  }
  return available.at(-1)
}

function sameSession(left: SessionTab, right: SessionTab) {
  return left.server === right.server && left.sessionId === right.sessionId
}
