import { createBocTranslator, type BocHost, type BocTerminalInput } from "@boc/extensions/renderer"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { ServerProvider } from "@/runtime/server/current"
import { ServerConnection, useServers } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { useSettings } from "@/settings/model"
import type { LocalPTY } from "@/session/terminal/context"
import { Terminal } from "@/session/terminal/terminal"
import { useCurrentRoute } from "@/shell/state/layout"
import { showToast } from "@/shell/notifications/toast"
import { findSessionTab, tabKey, type SessionTab, type Tab, useTabs } from "@/shell/tabs/tabs"
import { LocationProvider, useWorkspaceLocation } from "@/workspaces/location"

type TerminalRequest = {
  input: BocTerminalInput
  server: ServerConnection.Any
  directory: string
}

let lastLocalSession: SessionTab | undefined

export function createBocTerminal(): NonNullable<BocHost["terminal"]> {
  const global = useGlobal()
  const route = useCurrentRoute()
  const settings = useSettings()
  const tabs = useTabs()
  const servers = useServers()
  const t = createBocTranslator(useLanguage().locale)
  const [state, setState] = createStore<{ request?: TerminalRequest }>({})

  createEffect(() => {
    const current = route()
    if (current.type !== "session") return
    const server = servers.list.find((connection) => ServerConnection.key(connection) === current.server)
    if (!server || !ServerConnection.local(server)) return
    const tab = findSessionTab(tabs.store, current.server, current.sessionId)
    if (tab?.type === "session") lastLocalSession = tab
  })

  return {
    Panel() {
      return (
        <Show when={state.request} keyed>
          {(request) => (
            <ServerProvider conn={request.server}>
              <LocationProvider directory={request.directory}>
                <BocTerminalPanel input={request.input} close={() => setState("request", undefined)} />
              </LocationProvider>
            </ServerProvider>
          )}
        </Show>
      )
    },
    open(input) {
      const target = findBocTerminalTarget(tabs.store, servers.list, lastLocalSession)
      const server = target
        ? servers.list.find((connection) => ServerConnection.key(connection) === target.server)
        : undefined
      const directory =
        target && server
          ? (tabs.info[tabKey(target)]?.directory ??
            global.ensureServerCtx(server).data.session.get(target.sessionId)?.location.directory)
          : undefined
      if (!server || !directory) {
        showToast({ title: t("boc.terminal.sessionRequired") })
        return
      }
      setState("request", { input, server, directory })
    },
    close() {
      setState("request", undefined)
    },
    opened() {
      return state.request !== undefined
    },
    placement: settings.general.terminalPlacement,
  }
}

function BocTerminalPanel(props: { input: BocTerminalInput; close: () => void }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const server = useServerSDK()
  const workspace = useWorkspaceLocation()
  const [state, setState] = createStore({
    pty: undefined as LocalPTY | undefined,
    connected: false,
    exited: false,
    failed: false,
  })
  let disposed = false
  let ptyID: string | undefined

  const remove = (id: string) =>
    server.api.pty.remove({ ptyID: id, location: { directory: workspace().directory } }).catch(() => undefined)

  onMount(() => {
    const sdk = workspace()
    const unsubscribe = sdk.event.on("pty.exited", (event) => {
      if (event.data.id === ptyID) setState("exited", true)
    })
    void server.api.pty
      .create({
        command: props.input.command,
        args: [...props.input.args],
        title: props.input.title,
        location: { directory: sdk.directory },
      })
      .then((result) => {
        const pty = result.data
        if (!pty?.id) {
          if (!disposed) setState("failed", true)
          return
        }
        if (disposed) {
          void remove(pty.id)
          return
        }
        ptyID = pty.id
        setState({
          pty: { id: pty.id, title: pty.title, titleNumber: 0 },
          exited: pty.status === "exited",
        })
      })
      .catch(() => {
        if (!disposed) setState("failed", true)
      })

    onCleanup(unsubscribe)
  })

  onCleanup(() => {
    disposed = true
    if (ptyID) void remove(ptyID)
  })

  const connectionFailed = () => state.failed && !state.connected
  const status = () => {
    if (connectionFailed()) return t("boc.terminal.connectFailed")
    if (state.exited) return t("boc.terminal.ended")
    return undefined
  }

  return (
    <section
      data-boc-deployment-terminal
      class="flex size-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
    >
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-v2-border-border-muted px-3">
        <Icon name="terminal" class="shrink-0 text-v2-icon-icon-muted" />
        <span class="min-w-0 truncate text-[13px] leading-[var(--line-height-compact)] [font-weight:530]" dir="auto">
          {props.input.title}
        </span>
        <Show when={status()}>
          {(message) => (
            <span class="ms-auto truncate text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
              {message()}
            </span>
          )}
        </Show>
        <IconButton
          icon={<Icon name="close" size="large" />}
          variant="ghost-muted"
          size="small"
          aria-label={language.t("common.close")}
          onClick={props.close}
        />
      </header>
      <div class="relative min-h-0 flex-1">
        <Show
          when={state.pty}
          fallback={
            <div class="flex size-full items-center justify-center px-6 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
              {connectionFailed() ? t("boc.terminal.connectFailed") : t("boc.terminal.starting")}
            </div>
          }
        >
          {(pty) => (
            <Terminal
              pty={pty()}
              autoFocus
              class="!px-[14px]"
              onConnect={() => setState("connected", true)}
              onConnectError={() => setState(state.connected ? "exited" : "failed", true)}
            />
          )}
        </Show>
      </div>
    </section>
  )
}

export function findBocTerminalTarget(
  tabs: readonly Tab[],
  servers: readonly ServerConnection.Any[],
  preferred?: SessionTab,
) {
  const localServers = new Set(servers.filter(ServerConnection.local).map(ServerConnection.key))
  const available = tabs.filter((tab): tab is SessionTab => tab.type === "session" && localServers.has(tab.server))
  if (preferred) {
    const current = available.find((tab) => sameSession(tab, preferred))
    if (current) return current
  }
  return available.at(-1)
}

function sameSession(left: SessionTab, right: SessionTab) {
  return left.server === right.server && left.sessionId === right.sessionId
}
