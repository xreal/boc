import { parse } from "yaml"
import {
  boundDeploymentWorkflowInput,
  type DeploymentWorkflowFilename,
  type DeploymentWorkflowInputDefinition,
  type DeploymentWorkflowInputIssue,
  type DeploymentWorkflowTarget,
} from "../domain/workflows"

export const DEPLOYMENT_WORKFLOW_SOURCE_MAX_BYTES = 256 * 1024

export type ParsedDeploymentWorkflow = {
  target: DeploymentWorkflowTarget
  boundInputs: Readonly<Record<string, "environment" | "ref">>
  issues: readonly DeploymentWorkflowInputIssue[]
}

export function parseWorkflowDispatchContract(input: {
  filename: DeploymentWorkflowFilename
  name: string
  source: string
}): ParsedDeploymentWorkflow | undefined {
  if (input.source.length > DEPLOYMENT_WORKFLOW_SOURCE_MAX_BYTES) return undefined
  const document = parseWorkflowDocument(input.source)
  const dispatch = workflowDispatch(document)
  if (!dispatch) return undefined

  const entries = Object.entries(dispatch.inputs ?? {})
  const boundInputs: Record<string, "environment" | "ref"> = {}
  const definitions: DeploymentWorkflowInputDefinition[] = []
  const issues: DeploymentWorkflowInputIssue[] = []

  entries.forEach(([name, spec]) => {
    const parsed = parseWorkflowInput(name, spec)
    if (parsed.bound) {
      boundInputs[name] = parsed.bound
      return
    }
    if (parsed.definition) {
      definitions.push(parsed.definition)
      return
    }
    if (parsed.issue) issues.push(parsed.issue)
  })

  return {
    target: {
      filename: input.filename,
      name: input.name.trim() || input.filename,
      inputs: definitions,
    },
    boundInputs,
    issues,
  }
}

function parseWorkflowDocument(source: string) {
  try {
    return unknownRecord(parse(source, { maxAliasCount: 0, uniqueKeys: true }))
  } catch {
    return undefined
  }
}

function workflowDispatch(document: Record<string, unknown> | undefined) {
  if (!document) return undefined
  const trigger = document.on
  if (trigger === "workflow_dispatch") return { inputs: {} }
  if (Array.isArray(trigger) && trigger.includes("workflow_dispatch")) return { inputs: {} }
  const triggerRecord = unknownRecord(trigger)
  if (!triggerRecord || !Object.prototype.hasOwnProperty.call(triggerRecord, "workflow_dispatch")) return undefined
  const dispatch = triggerRecord.workflow_dispatch
  if (dispatch === null || dispatch === undefined || dispatch === true) return { inputs: {} }
  const dispatchRecord = unknownRecord(dispatch)
  if (!dispatchRecord) return { inputs: {} }
  if (dispatchRecord.inputs === undefined || dispatchRecord.inputs === null) return { inputs: {} }
  const inputs = unknownRecord(dispatchRecord.inputs)
  if (!inputs) return undefined
  return { inputs }
}

function parseWorkflowInput(name: string, spec: unknown) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(name)) {
    return { issue: { name, reason: "unsupported" as const } }
  }
  const fields = unknownRecord(spec) ?? {}
  const type = typeof fields.type === "string" ? fields.type : "string"
  const required = fields.required === true
  const label = typeof fields.description === "string" && fields.description.trim() ? fields.description.trim() : name
  const bound = boundDeploymentWorkflowInput(name)
  if (bound && (type === "string" || (bound === "environment" && type === "choice"))) return { bound }

  if (type === "boolean") {
    const defaultValue = booleanDefault(fields.default)
    return {
      definition: {
        name,
        label,
        type: "boolean" as const,
        required,
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
      },
    }
  }

  if (type === "choice") {
    const options = Array.isArray(fields.options)
      ? fields.options.filter((option): option is string => typeof option === "string" && option.length > 0)
      : []
    if (options.length === 0) {
      return { issue: { name, reason: required ? ("required" as const) : ("unsupported" as const) } }
    }
    const defaultValue =
      typeof fields.default === "string" && options.includes(fields.default) ? fields.default : undefined
    return {
      definition: {
        name,
        label,
        type: "choice" as const,
        required,
        options,
        ...(defaultValue === undefined ? {} : { default: defaultValue }),
      },
    }
  }

  if (!required) return {}
  return { issue: { name, reason: "unsupported" as const } }
}

function booleanDefault(value: unknown) {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

function unknownRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  return Object.fromEntries(Object.entries(value))
}
