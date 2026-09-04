import { createContext, useContext, type ParentProps } from "solid-js"
import type { BocDesktopAPI } from "../desktop/renderer/api"

const BocDesktopContext = createContext<BocDesktopAPI>()

export function BocDesktopProvider(props: ParentProps<{ value: BocDesktopAPI }>) {
  return <BocDesktopContext.Provider value={props.value}>{props.children}</BocDesktopContext.Provider>
}

export function useBocDesktop() {
  return useContext(BocDesktopContext)
}
