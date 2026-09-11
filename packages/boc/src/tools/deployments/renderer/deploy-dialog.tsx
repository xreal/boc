import { Combobox } from "@kobalte/core/combobox"
import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { useDialog } from "@opencode/ui/context/dialog"
import { For, Show, createUniqueId, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { createBocTranslator } from "../../../renderer/i18n"
import type { DeploymentOperationSummary } from "../domain/operations"
import { isReservedDevEnvironment } from "../domain/environments"
import type { DeploymentSystem } from "../domain/systems"
import { createDeploymentPreflight, type DeploymentDialogApi } from "./deploy-preflight"
import { deploymentFailureMessage } from "./deployment-failure"
import "./deploy-dialog.css"

export function DeploymentDialog(props: {
  api: DeploymentDialogApi
  locale: () => string
  system: DeploymentSystem
  kind: "deploy" | "reset" | "redeploy"
  initialRef?: string
  onQueued: (operation: DeploymentOperationSummary) => void
}) {
  const dialog = useDialog()
  const t = createBocTranslator(props.locale)
  const preflight = createDeploymentPreflight(props)
  const state = preflight.state
  const [view, setView] = createStore({ branchOpen: false, workflowQuery: "" })
  const optionId = createUniqueId()
  let disposed = false

  const submitting = () => state.status === "submitting"
  const busy = () => state.status === "checking" || (!preflight.reset && state.targetsStatus === "loading")
  const branchFailure = () => state.failure?.context?.field === "ref"
  const submissionUnknown = () => state.failure?.context?.field === "dispatch"
  const branchOptions = () => [
    ...new Set([
      ...state.branches.filter((branch) => branch.toLowerCase().includes(state.query.trim().toLowerCase())),
      ...(state.query.trim() ? [state.query.trim()] : []),
    ]),
  ]
  const selectedTargets = () => state.targets.filter((target) => state.selected.includes(target.filename))
  const visibleTargets = () =>
    state.targets.filter((target) =>
      `${target.name} ${target.filename}`.toLowerCase().includes(view.workflowQuery.trim().toLowerCase()),
    )
  const changedOptions = () =>
    selectedTargets().flatMap((target) =>
      target.inputs.flatMap((definition) => {
        const value = state.inputs[target.filename]?.[definition.name]
        if (value === undefined || value === definition.default) return []
        return [
          t("boc.deployments.deploy.optionSummary", {
            workflow: target.name,
            option: definition.label,
            value:
              typeof value === "boolean"
                ? t(value ? "boc.deployments.deploy.enabled" : "boc.deployments.deploy.disabled")
                : value,
          }),
        ]
      }),
    )
  const failureMessage = () => {
    if (!state.failure) return ""
    if (submissionUnknown()) return t("boc.deployments.deploy.submissionUnknown")
    if (branchFailure() && state.failure.category === "not-found") return t("boc.deployments.deploy.branch.notFound")
    if (
      state.failure.category === "network" ||
      (state.failure.category === "timeout" && state.failure.context?.field !== "preflight")
    )
      return t("boc.deployments.deploy.connectionFailed")
    if (state.failure.category === "not-authenticated") return t("boc.deployments.deploy.signInRequired")
    return deploymentFailureMessage(t, state.failure)
  }

  const dispatch = async () => {
    const operation = await preflight.dispatch()
    if (!operation) return
    props.onQueued(operation)
    if (!disposed) dialog.close()
  }

  // The shared dialog listens on window capture. Let Escape close this picker's menu first.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !view.branchOpen) return
    event.preventDefault()
    event.stopImmediatePropagation()
    setView("branchOpen", false)
  }
  window.addEventListener("keydown", onKeyDown, true)
  onCleanup(() => {
    disposed = true
    window.removeEventListener("keydown", onKeyDown, true)
  })
  onMount(() => void preflight.start())

  return (
    <Dialog size="large" fit class="deployment-preflight" containerClass="deployment-preflight-container">
      <DialogHeader closeLabel={t("boc.deployments.deploy.close")}>
        <DialogTitleGroup
          title={t(
            preflight.reset
              ? "boc.deployments.deploy.resetTitle"
              : props.kind === "redeploy"
                ? "boc.deployments.deploy.redeployTitle"
                : "boc.deployments.deploy.title",
            { system: props.system.name },
          )}
          description={
            props.system.branch
              ? t("boc.deployments.deploy.currentBranch", { branch: props.system.branch })
              : t("boc.deployments.deploy.emptySystem")
          }
        />
      </DialogHeader>
      <DialogBody class="deployment-preflight-body">
        <Show
          when={!preflight.branchLocked}
          fallback={
            <div class="deployment-preflight-summary">
              <span>{t("boc.deployments.deploy.branch.label")}</span>
              <bdi dir="ltr">{state.ref}</bdi>
            </div>
          }
        >
          <Combobox<string>
            class="deployment-branch"
            options={branchOptions()}
            value={state.ref || null}
            onInputChange={preflight.editBranch}
            onChange={(branch) => {
              if (!branch) return
              preflight.selectBranch(branch)
              setView("branchOpen", false)
            }}
            open={view.branchOpen && !submitting()}
            onOpenChange={(open) => setView("branchOpen", open)}
            defaultFilter={() => true}
            allowsEmptyCollection
            noResetInputOnBlur
            closeOnSelection
            triggerMode="focus"
            disabled={submitting()}
            validationState={branchFailure() ? "invalid" : "valid"}
            sameWidth
            gutter={6}
            itemComponent={(item) => (
              <Combobox.Item item={item.item} class="deployment-branch-option">
                <Combobox.ItemLabel>
                  <bdi dir="ltr">
                    {state.branches.includes(item.item.rawValue)
                      ? item.item.rawValue
                      : t("boc.deployments.deploy.branch.use", { branch: item.item.rawValue })}
                  </bdi>
                </Combobox.ItemLabel>
                <Combobox.ItemIndicator>
                  <Icon name="check" size="small" />
                </Combobox.ItemIndicator>
              </Combobox.Item>
            )}
          >
            <Combobox.Label class="deployment-preflight-label">
              {t("boc.deployments.deploy.branch.label")}
            </Combobox.Label>
            <Combobox.Control class="deployment-branch-control">
              <Combobox.Input
                as={TextInput}
                class="deployment-branch-input"
                autofocus
                name="deployment-ref"
                maxLength={255}
                value={state.query}
                autocomplete="off"
                spellcheck={false}
                dir="ltr"
                placeholder={t("boc.deployments.deploy.branch.placeholder")}
                invalid={branchFailure()}
                onFocus={() => {
                  if (!state.ref) void preflight.search()
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== "Enter" ||
                    event.currentTarget.getAttribute("aria-activedescendant") ||
                    !state.query.trim()
                  )
                    return
                  event.preventDefault()
                  preflight.selectBranch(state.query)
                  setView("branchOpen", false)
                }}
              />
              <Combobox.Trigger
                class="deployment-branch-trigger"
                aria-label={t("boc.deployments.deploy.branch.suggestions")}
              >
                <Icon name="chevron-down" size="small" />
              </Combobox.Trigger>
            </Combobox.Control>
            <Show when={branchFailure()}>
              <Combobox.ErrorMessage class="deployment-preflight-error">{failureMessage()}</Combobox.ErrorMessage>
            </Show>
            <Combobox.Portal>
              <Combobox.Content class="deployment-branch-menu">
                <Combobox.Listbox class="deployment-branch-list" />
                <Show when={state.searching}>
                  <p class="deployment-branch-notice" role="status">
                    {t("boc.deployments.deploy.branch.checking")}
                  </p>
                </Show>
                <Show when={state.searchFailure}>
                  <div class="deployment-branch-notice">
                    <span>{t("boc.deployments.deploy.branch.network")}</span>
                    <Button variant="ghost" size="small" onClick={() => void preflight.search()}>
                      {t("boc.deployments.deploy.retry")}
                    </Button>
                  </div>
                </Show>
                <Show when={!state.query.trim() && branchOptions().length === 0}>
                  <p class="deployment-branch-notice">{t("boc.deployments.deploy.branch.searchHint")}</p>
                </Show>
              </Combobox.Content>
            </Combobox.Portal>
          </Combobox>
        </Show>

        <Show
          when={!preflight.reset}
          fallback={
            <div class="deployment-preflight-summary">
              <span>{t("boc.deployments.deploy.workflows.label")}</span>
              <span>
                {state.plan?.workflows.map((workflow) => workflow.name).join(", ") ??
                  t("boc.deployments.deploy.resetWorkflow")}
              </span>
              <p>{t("boc.deployments.deploy.resetSummary")}</p>
            </div>
          }
        >
          <fieldset class="deployment-preflight-workflows" disabled={submitting() || state.targetsStatus !== "ready"}>
            <legend class="deployment-preflight-label">{t("boc.deployments.deploy.workflows.label")}</legend>
            <Show when={state.targets.length > 6}>
              <TextInput
                class="!w-full"
                aria-label={t("boc.deployments.deploy.workflows.search")}
                placeholder={t("boc.deployments.deploy.workflows.search")}
                value={view.workflowQuery}
                onInput={(event) => setView("workflowQuery", event.currentTarget.value)}
              />
            </Show>
            <Show
              when={state.targets.length > 0}
              fallback={
                <p class="deployment-preflight-muted" role="status">
                  {t(
                    state.targetsStatus === "idle"
                      ? "boc.deployments.deploy.workflows.chooseBranch"
                      : state.targetsStatus === "loading"
                        ? "boc.deployments.deploy.workflows.loading"
                        : state.targetsStatus === "failed"
                          ? "boc.deployments.deploy.workflows.failed"
                          : "boc.deployments.deploy.workflows.empty",
                  )}
                </p>
              }
            >
              <div class="deployment-workflow-choices">
                <For each={visibleTargets()}>
                  {(target) => (
                    <Checkbox
                      disabled={submitting() || state.targetsStatus !== "ready"}
                      checked={state.selected.includes(target.filename)}
                      onChange={(checked) => preflight.toggleWorkflow(target.filename, checked)}
                    >
                      {target.name}
                      <Show
                        when={state.targets.some(
                          (other) => other.filename !== target.filename && other.name === target.name,
                        )}
                      >
                        <span class="deployment-preflight-muted"> ({target.filename})</span>
                      </Show>
                    </Checkbox>
                  )}
                </For>
                <Show when={visibleTargets().length === 0}>
                  <p class="deployment-preflight-muted">{t("boc.deployments.deploy.workflows.noMatches")}</p>
                </Show>
              </div>
            </Show>
          </fieldset>

          <Show when={selectedTargets().some((target) => target.inputs.length > 0)}>
            <details class="deployment-preflight-options">
              <summary>{t("boc.deployments.deploy.options")}</summary>
              <For each={selectedTargets().filter((target) => target.inputs.length > 0)}>
                {(target) => (
                  <fieldset disabled={submitting() || state.targetsStatus !== "ready"}>
                    <legend>{target.name}</legend>
                    <For each={target.inputs}>
                      {(definition) => {
                        const value = () => state.inputs[target.filename]?.[definition.name] ?? definition.default
                        const id = `${optionId}-${target.filename}-${definition.name}`
                        return (
                          <div class="deployment-option-row">
                            <span id={id}>{definition.label}</span>
                            <Show
                              when={definition.type === "boolean"}
                              fallback={
                                <Select
                                  aria-labelledby={id}
                                  options={[...(definition.options ?? [])]}
                                  current={definition.options?.find((option) => option === value())}
                                  value={(option) => option}
                                  label={(option) => option}
                                  onSelect={(option) => {
                                    if (option !== null) preflight.setInput(target.filename, definition.name, option)
                                  }}
                                  disabled={submitting() || state.targetsStatus !== "ready"}
                                />
                              }
                            >
                              <Switch
                                aria-labelledby={id}
                                checked={value() === true}
                                disabled={submitting() || state.targetsStatus !== "ready"}
                                onChange={(checked) => preflight.setInput(target.filename, definition.name, checked)}
                              />
                            </Show>
                          </div>
                        )
                      }}
                    </For>
                  </fieldset>
                )}
              </For>
            </details>
            <Show when={changedOptions().length > 0}>
              <ul class="deployment-preflight-changes">
                <For each={changedOptions()}>{(option) => <li>{option}</li>}</For>
              </ul>
            </Show>
          </Show>
        </Show>

        <Show when={isReservedDevEnvironment(props.system.environment)}>
          <p class="deployment-preflight-warning">{t("boc.deployments.deploy.warning.unsafe-target")}</p>
        </Show>
        <Show when={props.kind === "deploy" && state.ref && props.system.branch && state.ref !== props.system.branch}>
          <p class="deployment-preflight-warning">
            {t("boc.deployments.deploy.replacesBranch", { branch: props.system.branch! })}
          </p>
        </Show>
        <Show when={state.failure && !branchFailure()}>
          <p class="deployment-preflight-error" role="alert">
            {failureMessage()}
          </p>
        </Show>
      </DialogBody>
      <DialogFooter>
        <div class="deployment-preflight-status" role="status">
          <Show when={state.status === "expired"}>
            <span>{t("boc.deployments.deploy.submit.expired")}</span>
          </Show>
          <Show when={!preflight.reset && state.targetsStatus === "ready" && !state.selected.length}>
            <span>{t("boc.deployments.deploy.submit.workflows")}</span>
          </Show>
          <Show when={!preflight.validInputs()}>
            <span>{t("boc.deployments.deploy.inputs.required")}</span>
          </Show>
          <Show
            when={
              !submissionUnknown() &&
              (state.status === "expired" ||
                state.status === "failed" ||
                state.targetsStatus === "failed" ||
                (!preflight.reset && state.targetsStatus === "ready" && state.targets.length === 0))
            }
          >
            <Button
              variant="ghost"
              size="small"
              onClick={() => void (preflight.reset ? preflight.prepare() : preflight.loadTargets(true))}
            >
              {t("boc.deployments.deploy.retry")}
            </Button>
          </Show>
        </div>
        <Button variant="outline" onClick={() => dialog.close()}>
          {t(submitting() || submissionUnknown() ? "boc.deployments.deploy.dismiss" : "boc.deployments.deploy.cancel")}
        </Button>
        <Button variant="contrast" disabled={state.status !== "ready"} onClick={() => void dispatch()}>
          {t(
            submitting()
              ? "boc.deployments.deploy.submit.dispatching"
              : busy()
                ? "boc.deployments.deploy.checking"
                : preflight.reset
                  ? "boc.deployments.deploy.submitReset"
                  : "boc.deployments.deploy.submit",
            { system: props.system.name },
          )}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
