import { normalizeDeploymentWorkflowInputs } from "../domain/workflows"
import type { DeploymentWorkflowInputValue, DeploymentWorkflowSelection, DeploymentWorkflowTarget } from "../rpcs"

export function deploymentDraftKey(input: { ref: string; workflows: readonly DeploymentWorkflowSelection[] }) {
  return JSON.stringify({
    ref: input.ref.trim(),
    workflows: [...input.workflows]
      .sort((left, right) => left.filename.localeCompare(right.filename))
      .map((workflow) => ({
        filename: workflow.filename,
        inputs: Object.fromEntries(
          Object.entries(workflow.inputs).sort(([left], [right]) => left.localeCompare(right)),
        ),
      })),
  })
}

export function deploymentSelections(
  targets: readonly DeploymentWorkflowTarget[],
  selected: readonly string[],
  inputs: Readonly<Record<string, Record<string, DeploymentWorkflowInputValue>>>,
) {
  return targets
    .filter((target) => selected.includes(target.filename))
    .map((target) => ({
      filename: target.filename,
      ...normalizeDeploymentWorkflowInputs(target.inputs, inputs[target.filename] ?? {}),
    }))
}
