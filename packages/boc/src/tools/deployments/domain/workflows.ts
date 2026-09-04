import { Schema } from "effect"

const WORKFLOW_FILENAME = /^app-[a-z0-9]+(?:-[a-z0-9]+)*\.ya?ml$/

export const DeploymentWorkflowFilename = Schema.String.check(
  Schema.isPattern(WORKFLOW_FILENAME),
  Schema.isMaxLength(128),
)
export type DeploymentWorkflowFilename = typeof DeploymentWorkflowFilename.Type

export const DeploymentWorkflowInputValue = Schema.Union([Schema.Boolean, Schema.String])
export type DeploymentWorkflowInputValue = typeof DeploymentWorkflowInputValue.Type

export const DeploymentWorkflowInputDefinition = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/)),
  label: Schema.String,
  type: Schema.Literals(["boolean", "choice"]),
  required: Schema.Boolean,
  default: Schema.optionalKey(DeploymentWorkflowInputValue),
  options: Schema.optionalKey(Schema.Array(Schema.String)),
})
export type DeploymentWorkflowInputDefinition = typeof DeploymentWorkflowInputDefinition.Type

export const DeploymentWorkflowTarget = Schema.Struct({
  filename: DeploymentWorkflowFilename,
  name: Schema.String,
  inputs: Schema.Array(DeploymentWorkflowInputDefinition),
})
export type DeploymentWorkflowTarget = typeof DeploymentWorkflowTarget.Type

export type DeploymentWorkflowInputIssue = {
  name: string
  reason: "unsupported" | "required" | "invalid"
}

export type NormalizedDeploymentWorkflowInputs = {
  values: Readonly<Record<string, DeploymentWorkflowInputValue>>
  issues: readonly DeploymentWorkflowInputIssue[]
}

export function isDeploymentWorkflowFilename(filename: string): filename is DeploymentWorkflowFilename {
  return WORKFLOW_FILENAME.test(filename) && filename.length <= 128
}

export function normalizeDeploymentWorkflowInputs(
  definitions: readonly DeploymentWorkflowInputDefinition[],
  input: Readonly<Record<string, unknown>>,
): NormalizedDeploymentWorkflowInputs {
  const definitionNames = new Set(definitions.map((definition) => definition.name))
  const unsupported = Object.keys(input)
    .filter((name) => !definitionNames.has(name))
    .map((name) => ({ name, reason: "unsupported" as const }))
  const normalized = definitions.map((definition) => normalizeInput(definition, input[definition.name]))

  return {
    values: Object.fromEntries(
      normalized.flatMap((result) => (result.value === undefined ? [] : [[result.name, result.value]])),
    ),
    issues: [...unsupported, ...normalized.flatMap((result) => (result.issue ? [result.issue] : []))],
  }
}

function normalizeInput(definition: DeploymentWorkflowInputDefinition, value: unknown) {
  const candidate = value ?? definition.default
  if (candidate === undefined) {
    return {
      name: definition.name,
      issue: definition.required ? { name: definition.name, reason: "required" as const } : undefined,
    }
  }
  if (definition.type === "boolean" && typeof candidate === "boolean") {
    return { name: definition.name, value: candidate }
  }
  if (definition.type === "choice" && typeof candidate === "string" && definition.options?.includes(candidate)) {
    return { name: definition.name, value: candidate }
  }
  return { name: definition.name, issue: { name: definition.name, reason: "invalid" as const } }
}
