import { Avatar } from "@opencode/ui/avatar"
import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"

export function JiraAvatar(props: { src?: string; fallback: string }) {
  const [state, setState] = createStore({ failed: false })
  createEffect(() => {
    props.src
    setState("failed", false)
  })
  return (
    <Show when={!state.failed && props.src} keyed fallback={<Avatar size="small" fallback={props.fallback} />}>
      {(src) => (
        <Avatar
          size="small"
          src={src}
          fallback={props.fallback}
          ref={(element) => {
            element.addEventListener("error", () => setState("failed", true), { capture: true, once: true })
          }}
        />
      )}
    </Show>
  )
}

/** The same identity presentation inside controls, properties, and activity. */
export function JiraPerson(props: { name: string; avatarUrl?: string }) {
  return (
    <span class="inline-flex min-w-0 items-center gap-2">
      <JiraAvatar src={props.avatarUrl} fallback={props.name} />
      <bdi dir="auto" class="min-w-0 truncate">
        {props.name}
      </bdi>
    </span>
  )
}
