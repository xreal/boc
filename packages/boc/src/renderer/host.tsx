import { createContext, useContext, type ParentProps } from "solid-js"

export type BocHost = {
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
