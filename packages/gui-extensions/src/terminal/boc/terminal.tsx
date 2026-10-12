import { lazy, Suspense } from "solid-js"
import { ExtensionContext, type Context, type SessionRef } from "@opencode/gui-extensions/sdk"
import type { LocalPTY } from "../state"

export type { LocalPTY } from "../state"

/** Reuse the native terminal under its owning extension without importing its implementation into Boc. */
export function BocTerminalView(props: {
  context: Context
  session: SessionRef
  directory: string
  pty: LocalPTY
  onConnect: () => void
  onConnectError: (error: Error) => void
}) {
  const TerminalView = lazy(async () => {
    const module = await import("../terminal")

    return { default: module.Terminal }
  })

  const engine = {
    load: () => import("ghostty-web").then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() })),
  }

  return (
    <ExtensionContext.Provider value={props.context}>
      <Suspense>
        <TerminalView
          pty={props.pty}
          server={props.session.server}
          directory={props.directory}
          ghostty={engine.load}
          autoFocus
          class="!px-[14px]"
          onConnect={props.onConnect}
          onConnectError={props.onConnectError}
        />
      </Suspense>
    </ExtensionContext.Provider>
  )
}
