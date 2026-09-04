import type { DeploymentPreparedPlan, DeploymentWorkflowInputValue } from "../rpcs"

export function deploymentDraftKey(input: {
  ref: string
  filenames: readonly string[]
  inputs: Readonly<Record<string, DeploymentWorkflowInputValue>>
}) {
  return JSON.stringify({
    ref: input.ref.trim(),
    filenames: [...input.filenames].toSorted(),
    inputs: Object.fromEntries(Object.entries(input.inputs).toSorted((left, right) => left[0].localeCompare(right[0]))),
  })
}

export function preparedPlanKey(plan: DeploymentPreparedPlan) {
  return deploymentDraftKey({
    ref: plan.ref,
    filenames: plan.workflows.map((workflow) => workflow.filename),
    inputs: mergedPreparedInputs(plan),
  })
}

export function mergedPreparedInputs(plan: DeploymentPreparedPlan) {
  return Object.fromEntries(plan.workflows.flatMap((workflow) => Object.entries(workflow.inputs)))
}

export function deploySubmitDisabledReason(input: {
  dispatching: boolean
  preparing: boolean
  ref: string
  filenames: readonly string[]
  draftKey: string
  plan?: DeploymentPreparedPlan
  now?: number
}) {
  if (input.dispatching) return "dispatching" as const
  if (!input.ref.trim()) return "ref" as const
  if (input.filenames.length === 0) return "workflows" as const
  if (input.preparing || !input.plan || preparedPlanKey(input.plan) !== input.draftKey) return "reviewing" as const
  if (Date.parse(input.plan.expiresAt) <= (input.now ?? Date.now())) return "expired" as const
  return undefined
}
