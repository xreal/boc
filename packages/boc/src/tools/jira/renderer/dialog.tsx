import { Dialog, type DialogProps } from "@opencode/ui/dialog"
import { onCleanup } from "solid-js"

/** Programmatic dialogs have no Kobalte trigger; restore focus after the portal is disposed. */
export function JiraDialog(props: DialogProps & { returnFocus?: HTMLElement }) {
  const opener =
    props.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
  onCleanup(() =>
    requestAnimationFrame(() => {
      if (opener?.isConnected && opener.getClientRects().length) opener.focus({ preventScroll: true })
    }),
  )
  return <Dialog {...props} />
}
