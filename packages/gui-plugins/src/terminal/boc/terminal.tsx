import { lazy, Suspense } from "solid-js"
import { PluginContext } from "@opencode/plugin/gui/host"
import type { Context, SessionRef } from "@opencode/plugin/gui"

/** Reuse the native terminal under its owning extension without importing its implementation into Boc. */
export function BocTerminalView(props: {
  context: Context
  session: SessionRef
  ptyID: string
  onFailure: () => void
}) {
  const TerminalView = lazy(async () => {
    const module = await import("../terminal")

    return { default: module.Terminal }
  })

  const engine = {
    load: () => import("ghostty-web").then(async (mod) => ({ mod, ghostty: await mod.Ghostty.load() })),
  }

  return (
    <PluginContext.Provider value={props.context}>
      <Suspense>
        <TerminalView
          ptyID={props.ptyID}
          server={props.session.server}
          ghostty={engine.load}
          autoFocus
          class="!px-[14px]"
          onFailure={props.onFailure}
        />
      </Suspense>
    </PluginContext.Provider>
  )
}
