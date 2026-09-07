import { Button } from "@opencode-ai/ui/button"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Field } from "@opencode-ai/ui/field"
import { Select } from "@opencode-ai/ui/select"
import { Switch } from "@opencode-ai/ui/switch"
import { TextInput } from "@opencode-ai/ui/text-input"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { For, Show, createEffect, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createBocTranslator } from "../../../renderer/i18n"
import { PREFERRED_DEPLOYMENT_WORKFLOW } from "../domain/workflows"
import type {
  DeploymentFailure,
  DeploymentPreparedPlan,
  DeploymentWorkflowInputValue,
  DeploymentWorkflowTarget,
} from "../rpcs"
import type { DeploymentOperationSummary } from "../domain/operations"
import type { DeploymentSystem } from "../domain/systems"
import { deploySubmitDisabledReason, deploymentDraftKey } from "./deploy-draft"
import { deploymentFailureMessage } from "./deployment-failure"

export type DeploymentDialogApi = Pick<
  BocDesktopAPI["deployments"],
  | "listBranches"
  | "listWorkflowTargets"
  | "prepareDeployment"
  | "dispatchPrepared"
  | "prepareReset"
  | "dispatchPreparedReset"
>

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
  const locked = props.kind === "reset"
  const branchLocked = locked || props.kind === "redeploy"
  const [form, setForm] = createStore({
    ref: locked ? "master" : (props.initialRef ?? props.system.branch ?? ""),
    branches: [] as string[],
    branchStatus: "idle" as "idle" | "checking" | "valid" | "invalid" | "network",
    workflowQuery: "",
    targets: [] as DeploymentWorkflowTarget[],
    selected: [] as string[],
    inputs: {} as Record<string, DeploymentWorkflowInputValue>,
    plan: undefined as DeploymentPreparedPlan | undefined,
    preparing: false,
    dispatching: false,
    failure: undefined as DeploymentFailure | undefined,
  })

  const selectedTargets = () => form.targets.filter((target) => form.selected.includes(target.filename))
  const visibleTargets = () => {
    const query = form.workflowQuery.trim().toLowerCase()
    if (!query) return form.targets
    return form.targets.filter(
      (target) => target.name.toLowerCase().includes(query) || target.filename.toLowerCase().includes(query),
    )
  }
  const workflowInputs = () => uniqueInputs(selectedTargets())
  const draftKey = () =>
    deploymentDraftKey({
      ref: form.ref,
      filenames: form.selected,
      inputs: form.inputs,
    })
  const reason = () =>
    deploySubmitDisabledReason({
      dispatching: form.dispatching,
      preparing: form.preparing,
      ref: form.ref,
      filenames: form.selected,
      draftKey: draftKey(),
      plan: form.plan,
    })
  const reviewing = () => reason() === "reviewing"
  const expired = () => reason() === "expired"

  const loadTargets = async () => {
    const result = await props.api.listWorkflowTargets({
      requestId: `workflows-${props.system.environment}`,
      refresh: false,
    })
    if (!result.ok) {
      setForm({ failure: result })
      return
    }
    const selected = locked
      ? result.targets
          .filter((target) => target.filename === PREFERRED_DEPLOYMENT_WORKFLOW)
          .map((target) => target.filename)
      : result.targets.some((target) => target.filename === PREFERRED_DEPLOYMENT_WORKFLOW)
        ? [PREFERRED_DEPLOYMENT_WORKFLOW]
        : result.targets.slice(0, 1).map((target) => target.filename)
    setForm({
      targets: [...result.targets],
      selected,
      inputs: defaultInputs(result.targets.filter((target) => selected.includes(target.filename))),
    })
  }

  const searchBranches = async (query: string) => {
    const requestId = `branches-${props.system.environment}`
    setForm("branchStatus", "checking")
    const result = await props.api.listBranches({ requestId, query })
    if (form.ref !== query) return
    if (!result.ok) {
      setForm({ branchStatus: "network", branches: [] })
      return
    }
    setForm({
      branches: [...result.branches],
      branchStatus: result.branches.includes(query.trim()) ? "valid" : query.trim() ? "invalid" : "idle",
    })
  }

  const prepare = async () => {
    if (locked) {
      setForm({ preparing: true, failure: undefined })
      const result = await props.api.prepareReset({ environment: props.system.environment })
      if (!result.ok) {
        setForm({ preparing: false, failure: result, plan: undefined })
        return
      }
      setForm({ preparing: false, plan: result.plan, failure: undefined })
      return
    }
    if (!form.ref.trim() || form.selected.length === 0) {
      setForm({ plan: undefined, preparing: false })
      return
    }
    setForm({ preparing: true, failure: undefined })
    const result = await props.api.prepareDeployment({
      environment: props.system.environment,
      ref: form.ref.trim(),
      workflows: form.selected.map((filename) => ({ filename, inputs: form.inputs })),
      ...(props.kind === "redeploy" ? { expectedBranch: props.system.branch } : {}),
    })
    if (!result.ok) {
      setForm({ preparing: false, failure: result, plan: undefined })
      return
    }
    setForm({ preparing: false, plan: result.plan, failure: undefined })
    if (result.plan.ref === form.ref.trim()) setForm("branchStatus", "valid")
  }

  const dispatch = async () => {
    if (form.dispatching || !form.plan || reason()) return
    setForm({ dispatching: true, failure: undefined })
    const result =
      props.kind === "reset"
        ? await props.api.dispatchPreparedReset({ preflightId: form.plan.preflightId })
        : await props.api.dispatchPrepared({ preflightId: form.plan.preflightId })
    if (!result.ok) {
      setForm({ dispatching: false, failure: result })
      if (result.category === "timeout") setForm("plan", undefined)
      return
    }
    props.onQueued(result.operation)
    dialog.close()
  }

  createEffect(() => {
    const query = form.ref.trim()
    if (branchLocked) return
    const handle = setTimeout(() => void searchBranches(query), 300)
    onCleanup(() => clearTimeout(handle))
  })

  createEffect(() => {
    draftKey()
    const handle = setTimeout(() => void prepare(), 300)
    onCleanup(() => clearTimeout(handle))
  })

  onMount(() => {
    void loadTargets()
  })

  return (
    <Dialog
      size="large"
      fit
      class="!overflow-hidden"
      containerClass="!h-auto !max-h-[calc(100vh-2rem)] !w-[min(44rem,calc(100vw-2rem))]"
      data-boc-dialog="deployment-preflight"
    >
      <DialogHeader closeLabel={t("boc.deployments.deploy.close")} hideClose={form.dispatching}>
        <DialogTitleGroup
          title={t(props.kind === "reset" ? "boc.deployments.deploy.resetTitle" : "boc.deployments.deploy.title", {
            system: props.system.name,
          })}
          description={t("boc.deployments.deploy.description", {
            branch: props.system.branch ?? t("boc.deployments.table.noValue"),
            availability: t(`boc.deployments.availability.${props.system.availability}`),
          })}
        />
      </DialogHeader>
      <DialogBody class="flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden !overflow-y-auto px-4 pb-4">
        <Show when={form.failure}>
          <p role="alert" class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-danger">
            {deploymentFailureMessage(t, form.failure!)}
          </p>
        </Show>

        <Field invalid={form.branchStatus === "invalid"}>
          <Field.Label>{t("boc.deployments.deploy.branch.label")}</Field.Label>
          <TextInput
            autofocus={!branchLocked}
            class="!w-full"
            name="deployment-ref"
            autocomplete="off"
            spellcheck={false}
            disabled={branchLocked || form.dispatching}
            placeholder={t("boc.deployments.deploy.branch.placeholder")}
            value={form.ref}
            onInput={(event) => setForm({ ref: event.currentTarget.value, plan: undefined })}
          />
          <Field.Prefix>
            {form.branchStatus === "checking"
              ? t("boc.deployments.deploy.branch.checking")
              : form.branchStatus === "valid"
                ? t("boc.deployments.deploy.branch.valid")
                : form.branchStatus === "invalid"
                  ? t("boc.deployments.deploy.branch.invalid")
                  : form.branchStatus === "network"
                    ? t("boc.deployments.deploy.branch.network")
                    : ""}
          </Field.Prefix>
        </Field>
        <Show when={!locked && form.branches.length > 0}>
          <ul
            class="max-h-32 overflow-auto rounded-md border border-v2-border-border-muted"
            aria-label={t("boc.deployments.deploy.branch.suggestions")}
          >
            <For each={form.branches}>
              {(branch) => (
                <li>
                  <button
                    type="button"
                    class="w-full px-3 py-1.5 text-left font-mono text-[12px] leading-[var(--line-height-compact)] hover:bg-v2-background-bg-layer-01"
                    onClick={() => setForm({ ref: branch, plan: undefined, branchStatus: "valid" })}
                  >
                    {branch}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.deploy.workflows.label")}
            </h2>
            <p class="text-[12px] text-v2-text-text-muted">
              {t("boc.deployments.deploy.workflows.selected", { count: form.selected.length })}
            </p>
          </div>
          <TextInput
            class="!w-full"
            name="deployment-workflow-search"
            autocomplete="off"
            disabled={locked || form.dispatching}
            placeholder={t("boc.deployments.deploy.workflows.search")}
            value={form.workflowQuery}
            onInput={(event) => setForm("workflowQuery", event.currentTarget.value)}
          />
          <ul class="max-h-40 overflow-auto rounded-md border border-v2-border-border-muted">
            <For each={visibleTargets()}>
              {(target) => (
                <li class="border-b border-v2-border-border-muted px-3 py-2 last:border-b-0">
                  <Checkbox
                    checked={form.selected.includes(target.filename)}
                    disabled={locked || form.dispatching}
                    description={target.filename}
                    onChange={(checked) => {
                      const selected = checked
                        ? [...form.selected, target.filename]
                        : form.selected.filter((filename) => filename !== target.filename)
                      setForm({
                        selected,
                        plan: undefined,
                        inputs: {
                          ...form.inputs,
                          ...defaultInputs(form.targets.filter((item) => selected.includes(item.filename))),
                        },
                      })
                    }}
                  >
                    {target.name}
                  </Checkbox>
                </li>
              )}
            </For>
          </ul>
        </div>

        <Show when={workflowInputs().length > 0}>
          <div class="flex flex-col gap-2">
            <h2 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.deploy.inputs.label")}
            </h2>
            <For each={workflowInputs()}>
              {(input) => (
                <Show
                  when={input.type === "boolean"}
                  fallback={
                    <Field>
                      <Field.Label>{input.label}</Field.Label>
                      <Select
                        class="!w-full"
                        disabled={locked || form.dispatching}
                        options={[...(input.options ?? [])]}
                        current={input.options?.find((option) => option === form.inputs[input.name])}
                        value={(option) => option}
                        label={(option) => option}
                        onSelect={(option) => {
                          if (option) setForm("inputs", { ...form.inputs, [input.name]: option })
                        }}
                      />
                    </Field>
                  }
                >
                  <div class="flex items-center justify-between gap-4 rounded-md border border-v2-border-border-muted px-3 py-2">
                    <span class="text-[13px] leading-[var(--line-height-compact)]">{input.label}</span>
                    <Switch
                      checked={form.inputs[input.name] === true}
                      disabled={locked || form.dispatching}
                      aria-label={input.label}
                      onChange={(checked) => setForm("inputs", { ...form.inputs, [input.name]: checked })}
                    />
                  </div>
                </Show>
              )}
            </For>
          </div>
        </Show>
        <Show when={form.plan?.warnings.includes("unsafe-target") && !reviewing()}>
          <p role="status" class="text-[12px] leading-[var(--line-height-compact)] text-v2-state-fg-warning">
            {t("boc.deployments.deploy.warning.unsafe-target")}
          </p>
        </Show>
      </DialogBody>
      <DialogFooter>
        <p class="mr-auto max-w-[18rem] text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
          {submitReasonCopy(t, reason())}
        </p>
        <Button type="button" variant="outline" disabled={form.dispatching} onClick={() => dialog.close()}>
          {t("boc.deployments.deploy.cancel")}
        </Button>
        <Button type="button" variant="neutral" disabled={reason() !== undefined} onClick={() => void dispatch()}>
          {form.dispatching
            ? t("boc.deployments.deploy.submit.dispatching")
            : t(props.kind === "reset" ? "boc.deployments.deploy.submitReset" : "boc.deployments.deploy.submit", {
                system: props.system.name,
              })}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function uniqueInputs(targets: readonly DeploymentWorkflowTarget[]) {
  const seen = new Set<string>()
  return targets.flatMap((target) =>
    target.inputs.filter((input) => {
      if (seen.has(input.name)) return false
      seen.add(input.name)
      return true
    }),
  )
}

function defaultInputs(targets: readonly DeploymentWorkflowTarget[]) {
  return Object.fromEntries(
    uniqueInputs(targets).flatMap((input) => (input.default === undefined ? [] : [[input.name, input.default]])),
  ) as Record<string, DeploymentWorkflowInputValue>
}

function submitReasonCopy(
  t: ReturnType<typeof createBocTranslator>,
  reason?: ReturnType<typeof deploySubmitDisabledReason>,
) {
  if (reason === "dispatching") return t("boc.deployments.deploy.submit.dispatching")
  if (reason === "expired") return t("boc.deployments.deploy.submit.expired")
  if (reason === "ref") return t("boc.deployments.deploy.submit.ref")
  if (reason === "workflows") return t("boc.deployments.deploy.submit.workflows")
  return ""
}

export function createFixtureDeploymentApi(): DeploymentDialogApi {
  let plan: DeploymentPreparedPlan | undefined
  return {
    listBranches: async (input) => ({
      ok: true as const,
      branches: [...(await import("../fixtures/github")).deploymentBranchFixtures].filter((branch) =>
        branch.toLowerCase().includes(input.query.trim().toLowerCase()),
      ),
    }),
    listWorkflowTargets: async () => ({
      ok: true as const,
      targets: [...(await import("../fixtures/github")).deploymentWorkflowFixtures],
    }),
    prepareDeployment: async (draft) => {
      const { deploymentWorkflowFixtures } = await import("../fixtures/github")
      plan = {
        preflightId: "fixture-plan",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        kind: "deploy",
        environment: draft.environment,
        ref: draft.ref,
        workflows: draft.workflows.map((workflow) => ({
          filename: workflow.filename,
          name:
            deploymentWorkflowFixtures.find((target) => target.filename === workflow.filename)?.name ??
            workflow.filename,
          inputs: workflow.inputs,
        })),
        warnings: [],
      }
      return { ok: true as const, plan }
    },
    prepareReset: async (input) => {
      plan = {
        preflightId: "fixture-reset",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        kind: "reset",
        environment: input.environment,
        ref: "master",
        workflows: [{ filename: "app-shop.yml", name: "Shop", inputs: { perform_tests: true, force_rebuild: false } }],
        warnings: [],
      }
      return { ok: true as const, plan }
    },
    dispatchPrepared: async () => queuedFixture(plan),
    dispatchPreparedReset: async () => queuedFixture(plan),
  }
}

function queuedFixture(plan?: DeploymentPreparedPlan) {
  if (!plan) {
    return {
      ok: false as const,
      category: "not-found" as const,
      retryable: false,
      capability: "github_workflow_dispatch" as const,
    }
  }
  return {
    ok: true as const,
    operation: {
      id: "fixture-operation",
      environment: plan.environment,
      branch: plan.ref,
      workflows: plan.workflows.map((workflow) => ({ filename: workflow.filename, state: "queued" as const })),
      state: "queued" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  }
}
