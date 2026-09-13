import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Icon } from "@opencode/ui/icon"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { For, Show, createEffect, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import {
  isDeploymentRebuildInput,
  isDeploymentRegressionInput,
  isDeploymentTestInput,
  type DeploymentWorkflowInputDefinition,
  type DeploymentWorkflowInputValue,
  type DeploymentWorkflowTarget,
} from "../domain/workflows"
import "./workflow-picker.css"

export function DeploymentWorkflowPicker(props: {
  targets: readonly DeploymentWorkflowTarget[]
  selected: readonly string[]
  inputs: Record<string, Record<string, DeploymentWorkflowInputValue>>
  disabled: boolean
  t: BocTranslator
  onToggle: (filename: string, checked: boolean) => void
  onInput: (filename: string, name: string, value: DeploymentWorkflowInputValue) => void
}) {
  const [search, setSearch] = createStore({ query: "", index: 0 })
  const query = () => search.query.trim().toLowerCase()
  const columns = createMemo(() => [
    ...new Map(props.targets.flatMap((target) => target.inputs.map((input) => [input.name, input] as const))).values(),
  ])
  const matches = createMemo(() =>
    query()
      ? props.targets.filter((target) => `${target.name} ${target.filename}`.toLowerCase().includes(query()))
      : [],
  )
  const active = () => matches()[search.index % matches().length]?.filename
  const rows = new Map<string, HTMLTableRowElement>()
  createEffect(() => {
    const filename = active()
    if (filename) rows.get(filename)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  })
  const find = (direction: number) => {
    if (!matches().length) return
    setSearch("index", (search.index + direction + matches().length) % matches().length)
  }

  return (
    <div class="deployment-workflow-picker">
      <div class="deployment-workflow-search">
        <TextInput
          class="!w-full"
          aria-label={props.t("boc.deployments.deploy.workflows.search")}
          placeholder={props.t("boc.deployments.deploy.workflows.search")}
          value={search.query}
          disabled={props.disabled}
          onInput={(event) => setSearch({ query: event.currentTarget.value, index: 0 })}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            find(event.shiftKey ? -1 : 1)
          }}
        />
        <span class="deployment-workflow-match-count" role="status">
          <Show when={query()}>
            {props.t("boc.deployments.deploy.workflows.matchPosition", {
              current: matches().length ? (search.index % matches().length) + 1 : 0,
              total: matches().length,
            })}
          </Show>
        </span>
        <Button
          variant="ghost"
          size="small"
          aria-label={props.t("boc.deployments.deploy.workflows.previousMatch")}
          disabled={props.disabled || !matches().length}
          onClick={() => find(-1)}
        >
          <Icon name="chevron-down" size="small" class="rotate-180" />
        </Button>
        <Button
          variant="ghost"
          size="small"
          aria-label={props.t("boc.deployments.deploy.workflows.nextMatch")}
          disabled={props.disabled || !matches().length}
          onClick={() => find(1)}
        >
          <Icon name="chevron-down" size="small" />
        </Button>
      </div>
      <div class="deployment-workflow-meta">
        <span>{props.t("boc.deployments.deploy.workflows.selectedCount", { count: props.selected.length })}</span>
        <span role="status">
          <span style={{ visibility: query() && !matches().length ? "hidden" : "visible" }}>
            {props.t("boc.deployments.deploy.workflows.findHint")}
          </span>
          <Show when={query() && !matches().length}>
            <span>{props.t("boc.deployments.deploy.workflows.noMatches")}</span>
          </Show>
        </span>
      </div>
      <div class="deployment-workflow-list">
        <table style={{ "min-width": `${240 + columns().length * 104}px` }}>
          <thead>
            <tr>
              <th scope="col">{props.t("boc.deployments.deploy.workflows.workflow")}</th>
              <For each={columns()}>
                {(definition) => (
                  <th scope="col" title={definition.label}>
                    {optionLabel(definition, props.t)}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={props.targets}>
              {(target) => {
                const selected = () => props.selected.includes(target.filename)
                const disabled = () => props.disabled || !selected()
                return (
                  <tr
                    ref={(row) => rows.set(target.filename, row)}
                    class="deployment-workflow-row"
                    data-selected={selected() ? "" : undefined}
                    data-match={active() === target.filename ? "" : undefined}
                  >
                    <th scope="row">
                      <Checkbox
                        disabled={props.disabled}
                        checked={selected()}
                        onChange={(checked) => props.onToggle(target.filename, checked)}
                      >
                        <bdi>
                          <WorkflowMatch text={target.name} query={query()} />
                        </bdi>
                        <Show when={target.name !== target.filename.replace(/\.ya?ml$/, "")}>
                          <span class="deployment-workflow-filename">
                            <bdi dir="ltr">
                              <WorkflowMatch text={target.filename} query={query()} />
                            </bdi>
                          </span>
                        </Show>
                      </Checkbox>
                    </th>
                    <For each={columns()}>
                      {(column) => (
                        <td>
                          <Show
                            when={target.inputs.find((input) => input.name === column.name)}
                            fallback={
                              <span
                                class="deployment-workflow-unavailable"
                                aria-label={props.t("boc.deployments.deploy.workflows.notApplicable")}
                              >
                                —
                              </span>
                            }
                          >
                            {(definition) => {
                              const value = () =>
                                props.inputs[target.filename]?.[definition().name] ?? definition().default
                              const label = () =>
                                props.t("boc.deployments.deploy.workflows.optionLabel", {
                                  workflow: target.name,
                                  option: definition().label,
                                })
                              return (
                                <div class="deployment-workflow-option" title={definition().label}>
                                  <Show
                                    when={definition().type === "boolean"}
                                    fallback={
                                      <Select
                                        aria-label={label()}
                                        options={[...(definition().options ?? [])]}
                                        current={definition().options?.find((option) => option === value())}
                                        value={(option) => option}
                                        label={(option) => option}
                                        disabled={disabled()}
                                        onSelect={(option) => {
                                          if (option !== null) props.onInput(target.filename, definition().name, option)
                                        }}
                                      />
                                    }
                                  >
                                    <Switch
                                      hideLabel
                                      checked={value() === true}
                                      disabled={disabled()}
                                      onChange={(checked) => props.onInput(target.filename, definition().name, checked)}
                                    >
                                      {label()}
                                    </Switch>
                                  </Show>
                                </div>
                              )
                            }}
                          </Show>
                        </td>
                      )}
                    </For>
                  </tr>
                )
              }}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function optionLabel(definition: DeploymentWorkflowInputDefinition, t: BocTranslator) {
  if (isDeploymentRegressionInput(definition.name)) return t("boc.deployments.deploy.workflows.regression")
  if (isDeploymentRebuildInput(definition.name)) return t("boc.deployments.deploy.workflows.rebuild")
  if (isDeploymentTestInput(definition.name)) return t("boc.deployments.deploy.workflows.tests")
  return definition.label
}

function WorkflowMatch(props: { text: string; query: string }) {
  const parts = createMemo(() => {
    if (!props.query) return [props.text]
    const escaped = props.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return props.text.split(new RegExp(`(${escaped})`, "gi"))
  })
  return (
    <For each={parts()}>
      {(part, index) => (
        <Show when={index() % 2} fallback={part}>
          <mark>{part}</mark>
        </Show>
      )}
    </For>
  )
}
