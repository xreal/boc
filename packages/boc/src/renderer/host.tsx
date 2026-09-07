import { createContext, useContext, type ParentProps } from "solid-js"

import type { BergflowHost } from "../tools/bergflow/host"

export type BocHost = {
  controls?: BergflowHost
  sessions?: {
    projects(): { server: string; directory: string; label: string }[]
    start(input: {
      prompt: string
      title: string
      issueUrl: string
      model: { providerID: string; modelID: string; variant?: string }
      target: { server: string; directory: string }
    }): Promise<void>
    open(server: string, sessionID: string): Promise<void>
  }
  navigate(to: string): void
  location(): { pathname: string; search: string }
  route(): { type: "boc"; id: string } | { type: string }
  openExternal(url: string): void
  locale(): string
  platform: "web" | "desktop"
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
