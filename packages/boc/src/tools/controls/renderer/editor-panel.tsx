import { Root, Portal, Overlay } from "@kobalte/core/dialog"
import { Dialog } from "@opencode/ui/dialog"
import type { ParentProps } from "solid-js"

export function EditorPanel(props: ParentProps<{ close: () => void }>) {
  return (
    <Root
      open
      onOpenChange={(open) => {
        if (!open) props.close()
      }}
    >
      <Portal>
        <Overlay class="controls-editor-overlay" />
        <Dialog class="controls-editor" containerClass="controls-editor-container">
          {props.children}
        </Dialog>
      </Portal>
    </Root>
  )
}
