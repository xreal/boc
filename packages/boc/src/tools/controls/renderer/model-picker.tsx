import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { List } from "@opencode/ui/list"
import { Popover } from "@opencode/ui/popover"
import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import type { BocControls, ControlModel, ControlsHost, ControlsSelection } from "../host"
import { Choice } from "./choice"

export function ModelPicker(props: {
  host: ControlsHost
  selection: ControlsSelection
  scope: BocControls.ConfigurationScope
  value: string
  inherited?: string
  disabled: boolean
  t: BocTranslator
  onChange: (value: string) => void
}) {
  const [view, setView] = createStore({ open: false, models: [] as ControlModel[], loading: true, error: false })
  createEffect(() => {
    const scope = props.scope
    let active = true
    setView({ loading: true, error: false })
    void props.host
      .models?.(props.selection, scope)
      .then((models) => {
        if (active) setView({ models, loading: false })
      })
      .catch(() => {
        if (active) setView({ error: true, loading: false })
      })
    if (!props.host.models) setView({ loading: false, error: true })
    onCleanup(() => {
      active = false
    })
  })
  const inherited = () =>
    props.t("boc.controls.model.inherit", { model: props.inherited ?? props.t("boc.controls.model.default") })
  const base = () => props.value.split("#")[0] ?? ""
  const variant = () => props.value.split("#")[1] ?? ""
  const variants = () =>
    view.models.filter((model) => model.id.startsWith(`${base()}#`)).map((model) => model.id.slice(base().length + 1))
  const options = createMemo(() => [
    { id: "", name: inherited(), provider: "" },
    ...(base() && !view.models.some((model) => model.id === base())
      ? [{ id: base(), name: base(), provider: props.t("boc.controls.model.configured") }]
      : []),
    ...view.models.filter((model) => !model.id.includes("#")),
  ])
  return (
    <div class="controls-model-field">
      <Popover
        modal
        open={view.open}
        onOpenChange={(open) => setView("open", open)}
        placement="bottom-start"
        class="controls-model-menu"
        triggerAs={Button}
        triggerProps={{
          variant: "outline",
          disabled: props.disabled,
          "aria-label": props.t("boc.controls.editor.model"),
          class: "controls-model-trigger",
        }}
        trigger={
          <>
            <span>{options().find((model) => model.id === base())?.name ?? inherited()}</span>
            <Icon name="chevron-down" size="small" />
          </>
        }
      >
        <Show when={view.error}>
          <p class="controls-editor-hint">{props.t("boc.controls.model.error")}</p>
        </Show>
        <List
          items={options}
          key={(model) => model.id}
          filterKeys={["name", "provider", "id"]}
          groupBy={(model) => model.provider}
          current={options().find((model) => model.id === base())}
          search={{ placeholder: props.t("boc.controls.model.search"), autofocus: true }}
          emptyMessage={props.t("boc.controls.model.empty")}
          onSelect={(model) => {
            if (model) {
              props.onChange(model.id)
              setView("open", false)
            }
          }}
        >
          {(model) => (
            <span class="controls-model-option" title={model.id}>
              {model.name}
            </span>
          )}
        </List>
      </Popover>
      <Show when={base() && (variants().length || variant())}>
        <div class="controls-model-variant">
          <span>{props.t("boc.controls.model.variant")}</span>
          <Choice
            label={props.t("boc.controls.model.variant")}
            value={variant()}
            disabled={props.disabled}
            options={[
              { value: "", label: props.t("boc.controls.model.defaultVariant") },
              ...[...new Set([...variants(), ...(variant() ? [variant()] : [])])].map((id) => ({
                value: id,
                label: id,
              })),
            ]}
            onChange={(id) => props.onChange(`${base()}${id ? `#${id}` : ""}`)}
          />
        </div>
      </Show>
    </div>
  )
}
