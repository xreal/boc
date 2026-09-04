import { createBocDesktopAPI } from "@boc/extensions/desktop/renderer"
import { BocDesktopProvider } from "@boc/extensions/renderer"
import type { ParentProps } from "solid-js"
import { invoke } from "../renderer/ipc-client"

const api = createBocDesktopAPI(invoke)

export default function Provider(props: ParentProps) {
  return <BocDesktopProvider value={api}>{props.children}</BocDesktopProvider>
}
