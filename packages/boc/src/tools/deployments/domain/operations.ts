import { Schema } from "effect"
import { AllowedDevEnvironment } from "./environments"
import { DeploymentWorkflowFilename } from "./workflows"

export const DeploymentOperationState = Schema.Literals([
  "prepared",
  "dispatching",
  "queued",
  "in-progress",
  "success",
  "failure",
  "cancelled",
  "timed-out",
  "unknown",
])
export type DeploymentOperationState = typeof DeploymentOperationState.Type

export const DeploymentJob = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  state: Schema.Union([DeploymentOperationState, Schema.Literals(["skipped", "waiting"])]),
})

export const DeploymentWorkflowOperation = Schema.Struct({
  filename: DeploymentWorkflowFilename,
  state: DeploymentOperationState,
  runId: Schema.optionalKey(Schema.String),
  runUrl: Schema.optionalKey(Schema.String),
  jobs: Schema.optionalKey(Schema.Array(DeploymentJob)),
  trackingUnavailable: Schema.optionalKey(Schema.Boolean),
  completion: Schema.optionalKey(Schema.Literals(["deployment", "workflow"])),
})
export type DeploymentWorkflowOperation = typeof DeploymentWorkflowOperation.Type

export const DeploymentOperationSummary = Schema.Struct({
  id: Schema.String,
  environment: AllowedDevEnvironment,
  branch: Schema.String,
  ticketKey: Schema.optionalKey(Schema.String),
  workflows: Schema.Array(DeploymentWorkflowOperation),
  state: DeploymentOperationState,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  dispatchedAt: Schema.optionalKey(Schema.String),
  finishedAt: Schema.optionalKey(Schema.String),
})
export type DeploymentOperationSummary = typeof DeploymentOperationSummary.Type

export const DEPLOYMENT_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000

const TERMINAL_OPERATION_STATES = new Set<DeploymentOperationState>(["success", "failure", "cancelled", "timed-out"])

const OPERATION_PRECEDENCE: readonly DeploymentOperationState[] = [
  "failure",
  "timed-out",
  "cancelled",
  "unknown",
  "in-progress",
  "dispatching",
  "queued",
  "prepared",
]

export function isTerminalDeploymentOperation(state: DeploymentOperationState) {
  return TERMINAL_OPERATION_STATES.has(state)
}

export function isBlockingDeploymentOperation(state: DeploymentOperationState) {
  return !isTerminalDeploymentOperation(state) && state !== "prepared"
}

export function aggregateDeploymentOperation(states: readonly DeploymentOperationState[]): DeploymentOperationState {
  if (states.length === 0) return "unknown"
  if (states.every((state) => state === "success")) return "success"
  // A failed sibling must not release the environment while another workflow still deploys.
  const active = states.filter((state) => !isTerminalDeploymentOperation(state))
  if (active.length) return OPERATION_PRECEDENCE.find((state) => active.includes(state)) ?? "unknown"
  return OPERATION_PRECEDENCE.find((state) => states.includes(state)) ?? "unknown"
}

export function pruneDeploymentHistory(
  operations: readonly DeploymentOperationSummary[],
  now = Date.now(),
  retentionMs = DEPLOYMENT_HISTORY_RETENTION_MS,
) {
  const oldestRetained = now - retentionMs
  return operations.filter((operation) => {
    if (!isTerminalDeploymentOperation(operation.state)) return true
    const updatedAt = Date.parse(operation.updatedAt)
    return Number.isFinite(updatedAt) && updatedAt >= oldestRetained
  })
}
