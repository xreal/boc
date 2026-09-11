import { createUniqueId, onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { deploymentFailure } from "../domain/failures"
import type { DeploymentSystem } from "../domain/systems"
import { PREFERRED_DEPLOYMENT_WORKFLOW, RESET_DEPLOYMENT_REF } from "../domain/workflows"
import type {
  DeploymentFailure,
  DeploymentPreparedPlan,
  DeploymentWorkflowInputValue,
  DeploymentWorkflowTarget,
} from "../rpcs"
import { deploymentDraftKey, deploymentSelections } from "./deploy-draft"
import { createLatestDeploymentRequest } from "./latest-request"

export type DeploymentDialogApi = Pick<
  BocDesktopAPI["deployments"],
  | "listBranches"
  | "listWorkflowTargets"
  | "prepareDeployment"
  | "dispatchPrepared"
  | "prepareReset"
  | "dispatchPreparedReset"
  | "cancelSystemsRead"
>

export function createDeploymentPreflight(input: {
  api: DeploymentDialogApi
  system: DeploymentSystem
  kind: "deploy" | "reset" | "redeploy"
  initialRef?: string
}) {
  const reset = input.kind === "reset"
  const branchLocked = input.kind !== "deploy"
  const initial = reset ? RESET_DEPLOYMENT_REF : (input.initialRef ?? input.system.branch ?? "").trim()
  const [state, setState] = createStore({
    query: initial,
    ref: reset || branchLocked || initial === input.system.branch ? initial : "",
    branches: input.system.branch ? [input.system.branch] : [],
    searching: false,
    searchFailure: false,
    targets: [] as DeploymentWorkflowTarget[],
    targetsStatus: "idle" as "idle" | "loading" | "ready" | "failed",
    selected: [] as string[],
    inputs: {} as Record<string, Record<string, DeploymentWorkflowInputValue>>,
    status: "editing" as "editing" | "checking" | "ready" | "expired" | "failed" | "submitting",
    failure: undefined as DeploymentFailure | undefined,
    plan: undefined as DeploymentPreparedPlan | undefined,
  })
  const prefix = `preflight-${createUniqueId()}`
  const request = (kind: string) =>
    createLatestDeploymentRequest({
      prefix: `${prefix}-${kind}`,
      cancel: (requestId) => void input.api.cancelSystemsRead({ requestId }).catch(() => {}),
    })
  const branches = request("branches")
  const targets = request("targets")
  const preparation = request("prepare")
  let searchTimer: ReturnType<typeof setTimeout> | undefined
  let prepareTimer: ReturnType<typeof setTimeout> | undefined
  let expiryTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const selections = () => deploymentSelections(state.targets, state.selected, state.inputs)
  const workflows = () => selections().map((selection) => ({ filename: selection.filename, inputs: selection.values }))
  const validInputs = () => selections().every((selection) => selection.issues.length === 0)
  const draftKey = () => deploymentDraftKey({ ref: state.ref, workflows: workflows() })
  const canPrepare = () =>
    !!state.ref && (reset || (state.targetsStatus === "ready" && state.selected.length > 0 && validInputs()))

  const invalidate = () => {
    clearTimeout(prepareTimer)
    clearTimeout(expiryTimer)
    preparation.invalidate()
    setState({ status: "editing", plan: undefined, failure: undefined })
  }

  const prepare = async () => {
    if (disposed || state.status === "submitting") return
    invalidate()
    if (!canPrepare()) return
    const current = preparation.begin()
    const key = draftKey()
    setState("status", "checking")
    const result = await (
      reset
        ? input.api.prepareReset({ environment: input.system.environment, requestId: current.requestId })
        : input.api.prepareDeployment({
            requestId: current.requestId,
            environment: input.system.environment,
            ref: state.ref,
            workflows: workflows(),
            ...(input.kind === "redeploy" ? { expectedBranch: input.system.branch } : {}),
          })
    ).catch(() => deploymentFailure("network"))
    if (!preparation.isCurrent(current) || disposed) return
    preparation.finish(current)
    if (!result.ok) {
      setState({ status: "failed", failure: result })
      return
    }
    // A branch can have different workflow inputs than the catalog. Never enable a silently changed draft.
    if (!reset && (key !== draftKey() || deploymentDraftKey(result.plan) !== key)) {
      setState({ status: "failed", failure: deploymentFailure("invalid-input", { context: { field: "workflows" } }) })
      return
    }
    const remaining = Date.parse(result.plan.expiresAt) - Date.now()
    setState({ status: remaining > 0 ? "ready" : "expired", plan: result.plan })
    expiryTimer = setTimeout(() => setState("status", "expired"), Math.max(0, remaining))
  }

  const schedulePreparation = () => {
    invalidate()
    if (canPrepare()) prepareTimer = setTimeout(() => void prepare(), 200)
  }

  const loadTargets = async (refresh = false) => {
    if (disposed || state.status === "submitting") return
    invalidate()
    const current = targets.begin()
    setState("targetsStatus", "loading")
    const result = await input.api
      .listWorkflowTargets({ requestId: current.requestId, refresh, ...(state.ref ? { ref: state.ref } : {}) })
      .catch(() => deploymentFailure("network"))
    if (!targets.isCurrent(current) || disposed) return
    targets.finish(current)
    if (!result.ok) {
      setState({ targetsStatus: "failed", failure: result })
      return
    }
    const preferred =
      result.targets.find((target) => target.filename === PREFERRED_DEPLOYMENT_WORKFLOW) ?? result.targets[0]
    const selected = state.targets.length
      ? state.selected.filter((filename) => result.targets.some((target) => target.filename === filename))
      : preferred
        ? [preferred.filename]
        : []
    setState({ targets: [...result.targets], selected, targetsStatus: "ready" })
    setState(
      "inputs",
      reconcile(
        Object.fromEntries(
          result.targets.map((target) => [
            target.filename,
            Object.fromEntries(
              Object.entries(state.inputs[target.filename] ?? {}).filter(([name]) =>
                target.inputs.some((definition) => definition.name === name),
              ),
            ),
          ]),
        ),
      ),
    )
    schedulePreparation()
  }

  const search = async () => {
    if (disposed || branchLocked || state.status === "submitting") return
    clearTimeout(searchTimer)
    const query = state.query.trim()
    branches.invalidate()
    if (query.length < 2) {
      setState({ searching: false, searchFailure: false })
      return
    }
    const current = branches.begin()
    setState({ searching: true, searchFailure: false })
    const result = await input.api
      .listBranches({ requestId: current.requestId, query })
      .catch(() => deploymentFailure("network"))
    if (!branches.isCurrent(current) || disposed) return
    branches.finish(current)
    setState({
      searching: false,
      searchFailure: !result.ok,
      ...(result.ok ? { branches: [...new Set([...result.branches, ...state.branches])].slice(0, 100) } : {}),
    })
  }

  const editBranch = (query: string) => {
    if (branchLocked || state.status === "submitting" || state.query === query) return
    invalidate()
    branches.invalidate()
    targets.invalidate()
    clearTimeout(searchTimer)
    setState({
      query,
      ref: "",
      searching: false,
      searchFailure: false,
      targetsStatus: state.targets.length ? "ready" : "idle",
    })
    searchTimer = setTimeout(() => void search(), 250)
  }

  const selectBranch = (ref: string) => {
    if (branchLocked || state.status === "submitting" || !ref.trim()) return
    clearTimeout(searchTimer)
    branches.invalidate()
    setState({ query: ref.trim(), ref: ref.trim(), searching: false, searchFailure: false })
    void loadTargets()
  }

  const toggleWorkflow = (filename: string, checked: boolean) => {
    if (reset || state.status === "submitting") return
    setState(
      "selected",
      checked ? [...new Set([...state.selected, filename])] : state.selected.filter((item) => item !== filename),
    )
    schedulePreparation()
  }

  const setInput = (filename: string, name: string, value: DeploymentWorkflowInputValue) => {
    if (reset || state.status === "submitting") return
    setState("inputs", filename, { ...state.inputs[filename], [name]: value })
    schedulePreparation()
  }

  const dispatch = async () => {
    if (state.status !== "ready" || !state.plan || disposed) return
    if (Date.parse(state.plan.expiresAt) <= Date.now()) {
      setState("status", "expired")
      return
    }
    clearTimeout(expiryTimer)
    setState({ status: "submitting", failure: undefined })
    const result = await (reset ? input.api.dispatchPreparedReset : input.api.dispatchPrepared)({
      preflightId: state.plan.preflightId,
    }).catch(() => deploymentFailure("network", { context: { field: "dispatch" } }))
    if (!result.ok) {
      // Dispatch outcomes may be uncertain. Never replay a mutation automatically.
      if (!disposed) setState({ status: "failed", failure: result, plan: undefined })
      return
    }
    return result.operation
  }

  onCleanup(() => {
    disposed = true
    clearTimeout(searchTimer)
    clearTimeout(prepareTimer)
    clearTimeout(expiryTimer)
    branches.invalidate()
    targets.invalidate()
    preparation.invalidate()
  })

  return {
    state,
    reset,
    branchLocked,
    workflows,
    validInputs,
    canPrepare,
    start: () => (reset ? prepare() : state.ref ? loadTargets() : Promise.resolve()),
    search,
    editBranch,
    selectBranch,
    toggleWorkflow,
    setInput,
    prepare,
    loadTargets,
    dispatch,
  }
}
