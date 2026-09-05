import { For } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraSessionInstructions } from "../domain/sessions"

export function JiraSessionInstructionFields(props: {
  t: BocTranslator
  value: JiraSessionInstructions
  disabled: boolean
  onChange: (field: keyof JiraSessionInstructions, value: string) => void
}) {
  return (
    <div class="flex flex-col gap-2">
      <For each={["before", "after"] as const}>
        {(field) => (
          <label class="flex flex-col gap-1 text-[13px] leading-[var(--line-height-base)]">
            {props.t(field === "before" ? "boc.jira.sessions.before" : "boc.jira.sessions.after")}
            <textarea
              rows={3}
              value={props.value[field]}
              disabled={props.disabled}
              onInput={(event) => props.onChange(field, event.currentTarget.value)}
              class="resize-y rounded border border-v2-border-border-base bg-v2-background-bg-base p-2 text-v2-text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus disabled:opacity-50"
            />
          </label>
        )}
      </For>
    </div>
  )
}
