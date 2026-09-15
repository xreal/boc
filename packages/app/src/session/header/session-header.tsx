import { createMediaQuery } from "@solid-primitives/media"
import { Show } from "solid-js"
import { BocEnvironmentSessionControl } from "@/boc/environments/session"

export function SessionHeaderEndActions(props: { visible: boolean }) {
  const isDesktop = createMediaQuery("(min-width: 768px)")

  return (
    <Show when={isDesktop() && props.visible}>
      <BocEnvironmentSessionControl />
      <div class="size-7 shrink-0" aria-hidden />
    </Show>
  )
}
