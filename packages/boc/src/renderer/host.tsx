import { createContext, useContext, type Component, type ParentProps } from "solid-js"

import type { ControlsHost } from "../tools/controls/host"

export type BocTerminalInput = {
  command: string
  args: readonly string[]
  title: string
}

export type BocHost = {
  controls?: ControlsHost
  terminal?: {
    Panel: Component
    open(input: BocTerminalInput): void
    close(): void
    opened(): boolean
    placement(): "side" | "bottom"
  }
  sessions?: {
    projects(): { server: string; directory: string; label: string }[]
    start(input: {
      title: string
      issueUrl: string
      target: { server: string; directory: string }
      prompt?: string
      model?: { providerID: string; modelID: string; variant?: string }
    }): Promise<void>
    open(server: string, sessionID: string): Promise<void>
  }
  navigate(to: string): void
  location(): { pathname: string; search: string }
  route(): { type: "boc"; id: string } | { type: string }
  openExternal(url: string): void
  locale(): string
  platform: "web" | "desktop"
  windowTopInset?: () => number
}

const BocHostContext = createContext<BocHost>()

export function BocHostProvider(props: ParentProps<{ value: BocHost }>) {
  return <BocHostContext.Provider value={props.value}>{props.children}</BocHostContext.Provider>
}

export function useBocHost() {
  const host = useContext(BocHostContext)
  if (!host) throw new Error("BocHostProvider is missing")
  return host
}
