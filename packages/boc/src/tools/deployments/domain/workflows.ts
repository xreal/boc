import { Schema } from "effect"

const WORKFLOW_FILENAME = /^app-[a-z0-9]+(?:-[a-z0-9]+)*\.ya?ml$/

export const PREFERRED_DEPLOYMENT_WORKFLOW = "app-shop.yml"
export const RESET_DEPLOYMENT_REF = "master"
export const DEPLOYMENT_WORKFLOW_PATH_PREFIX = ".github/workflows/"

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

export function deploymentWorkflowFilenameFromPath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  const filename = normalized.startsWith(DEPLOYMENT_WORKFLOW_PATH_PREFIX)
    ? normalized.slice(DEPLOYMENT_WORKFLOW_PATH_PREFIX.length)
    : normalized.includes("/")
      ? undefined
      : normalized
  if (!filename || filename.includes("/") || filename.includes("..")) return undefined
  return isDeploymentWorkflowFilename(filename) ? filename : undefined
}

export function preferredDeploymentWorkflows<Target extends { filename: string; name: string }>(
  targets: readonly Target[],
) {
  return [...targets].toSorted((left, right) => {
    if (left.filename === PREFERRED_DEPLOYMENT_WORKFLOW) return -1
    if (right.filename === PREFERRED_DEPLOYMENT_WORKFLOW) return 1
    return left.name.localeCompare(right.name)
  })
}

export function isDeploymentTestInput(name: string) {
  return /test/i.test(name) && !/regression/i.test(name)
}

export function isDeploymentRebuildInput(name: string) {
  return /rebuild|force.?image/i.test(name)
}

export function isDeploymentRegressionInput(name: string) {
  return /regression/i.test(name)
}

export function isCommonDeploymentInput(name: string) {
  return isDeploymentTestInput(name) || isDeploymentRebuildInput(name) || isDeploymentRegressionInput(name)
}

export function boundDeploymentWorkflowInput(name: string) {
  if (/^(environment|env|system|target)$/i.test(name)) return "environment" as const
  if (/^(ref|branch|revision)$/i.test(name)) return "ref" as const
  return undefined
}

export function resetDeploymentWorkflowInputs(definitions: readonly DeploymentWorkflowInputDefinition[]) {
  const values = { ...normalizeDeploymentWorkflowInputs(definitions, {}).values }
  definitions.forEach((definition) => {
    if (definition.type !== "boolean") return
    if (isDeploymentTestInput(definition.name)) values[definition.name] = true
    if (isDeploymentRebuildInput(definition.name) || isDeploymentRegressionInput(definition.name)) {
      values[definition.name] = false
    }
  })
  return values
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
