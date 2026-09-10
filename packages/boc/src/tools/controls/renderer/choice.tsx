import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { Select } from "@opencode/ui/select"
import { For, Show } from "solid-js"
import "./choice.css"

export function Choice(props: {
  label: string
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
  inline?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Show
      when={props.inline ?? props.options.length <= 3}
      fallback={
        <Select
          options={props.options}
          current={props.options.find((option) => option.value === props.value)}
          value={(option) => option.value}
          label={(option) => option.label}
          aria-label={props.label}
          disabled={props.disabled}
          placeholder={props.label}
          onSelect={(option) => {
            if (option) props.onChange(option.value)
          }}
        />
      }
    >
      <SegmentedControl
        class="controls-choice"
        aria-label={props.label}
        value={props.value}
        disabled={props.disabled}
        onChange={(value) => {
          if (value !== null) props.onChange(value)
        }}
      >
        <For each={props.options}>
          {(option) => <SegmentedControlItem value={option.value}>{option.label}</SegmentedControlItem>}
        </For>
      </SegmentedControl>
    </Show>
  )
}
