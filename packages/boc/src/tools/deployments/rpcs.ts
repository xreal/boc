import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { AllowedDevEnvironment } from "./domain/environments"
import { DeploymentCapability, DeploymentFailure, DeploymentFailureCategory } from "./domain/failures"
import { DeploymentAutoSyncState, DeploymentSystem } from "./domain/systems"
import { DeploymentOperationSummary } from "./domain/operations"
import { DeploymentWorkflowFilename, DeploymentWorkflowInputValue, DeploymentWorkflowTarget } from "./domain/workflows"

export {
  ALLOWED_DEV_ENVIRONMENTS,
  AllowedDevEnvironment,
  DEPLOYMENT_KUBE_CONTEXT,
  RESERVED_DEV_ENVIRONMENTS,
  STANDARD_DEV_ENVIRONMENTS,
} from "./domain/environments"
export { DeploymentCapability, DeploymentFailure, DeploymentFailureCategory } from "./domain/failures"
export { DeploymentOperationState, DeploymentOperationSummary, DeploymentWorkflowOperation } from "./domain/operations"
export {
  DeploymentAutoSyncState,
  DeploymentAvailability,
  DeploymentHealthState,
  DeploymentSyncState,
  DeploymentSystem,
} from "./domain/systems"
export {
  DeploymentWorkflowFilename,
  DeploymentWorkflowInputDefinition,
  DeploymentWorkflowInputValue,
  DeploymentWorkflowTarget,
} from "./domain/workflows"

const DeploymentRequestId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const DeploymentRef = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255))
const DeploymentPreflightId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))
const DeploymentLabelKey = Schema.String.check(
  Schema.isPattern(/^(?:[a-z0-9](?:[-a-z0-9.]{0,125}[a-z0-9])?\/)?[A-Za-z0-9](?:[-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/),
  Schema.isMaxLength(128),
)
const DeploymentLabelValue = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9](?:[-A-Za-z0-9_.]{0,61}[A-Za-z0-9])?$/),
  Schema.isMaxLength(63),
)

export const DeploymentSettings = Schema.Struct({
  devenvPath: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
  argoProject: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/))),
  applicationLabelKey: DeploymentLabelKey,
  applicationLabelValue: DeploymentLabelValue,
  notificationsEnabled: Schema.Boolean,
})
export type DeploymentSettings = typeof DeploymentSettings.Type

export const DeploymentCapabilityStatus = Schema.Struct({
  capability: DeploymentCapability,
  status: Schema.Literals(["available", "unavailable", "unknown"]),
  failure: Schema.optionalKey(DeploymentFailureCategory),
  context: Schema.optionalKey(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number]))),
})
export type DeploymentCapabilityStatus = typeof DeploymentCapabilityStatus.Type

export const DeploymentReadiness = Schema.Struct({
  fleetReady: Schema.Boolean,
  deploymentReady: Schema.Boolean,
  capabilities: Schema.Array(DeploymentCapabilityStatus),
})
export type DeploymentReadiness = typeof DeploymentReadiness.Type

export const DeploymentWorkspace = Schema.Struct({
  settings: DeploymentSettings,
  readiness: DeploymentReadiness,
  systems: Schema.Array(DeploymentSystem),
  operations: Schema.Array(DeploymentOperationSummary),
  fetchedAt: Schema.optionalKey(Schema.String),
  staleFailure: Schema.optionalKey(DeploymentFailure),
})
export type DeploymentWorkspace = typeof DeploymentWorkspace.Type

export const DeploymentWorkspaceResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), workspace: DeploymentWorkspace }),
  DeploymentFailure,
])
export type DeploymentWorkspaceResult = typeof DeploymentWorkspaceResult.Type

export const DeploymentSystemsReadInput = Schema.Struct({
  requestId: DeploymentRequestId,
  refresh: Schema.Boolean,
})
export type DeploymentSystemsReadInput = typeof DeploymentSystemsReadInput.Type

const DeploymentRequestInput = Schema.Struct({ requestId: DeploymentRequestId })

export const DeploymentSystemsResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    systems: Schema.Array(DeploymentSystem),
    readiness: DeploymentReadiness,
    fetchedAt: Schema.optionalKey(Schema.String),
    staleFailure: Schema.optionalKey(DeploymentFailure),
  }),
  DeploymentFailure,
])
export type DeploymentSystemsResult = typeof DeploymentSystemsResult.Type

export const DeploymentSettingsResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), settings: DeploymentSettings, readiness: DeploymentReadiness }),
  DeploymentFailure,
])
export type DeploymentSettingsResult = typeof DeploymentSettingsResult.Type

export const DeploymentBranchSearchInput = Schema.Struct({
  requestId: DeploymentRequestId,
  query: Schema.String.check(Schema.isMaxLength(255)),
})
export type DeploymentBranchSearchInput = typeof DeploymentBranchSearchInput.Type

const DeploymentBranchesResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), branches: Schema.Array(Schema.String) }),
  DeploymentFailure,
])

const DeploymentWorkflowReadInput = Schema.Struct({
  requestId: DeploymentRequestId,
  refresh: Schema.Boolean,
})

const DeploymentWorkflowTargetsResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), targets: Schema.Array(DeploymentWorkflowTarget) }),
  DeploymentFailure,
])

const DeploymentOperationsResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), operations: Schema.Array(DeploymentOperationSummary) }),
  DeploymentFailure,
])

export const DeploymentWorkflowSelection = Schema.Struct({
  filename: DeploymentWorkflowFilename,
  inputs: Schema.Record(Schema.String, DeploymentWorkflowInputValue),
})
export type DeploymentWorkflowSelection = typeof DeploymentWorkflowSelection.Type

export const DeploymentDraft = Schema.Struct({
  environment: AllowedDevEnvironment,
  ref: DeploymentRef,
  workflows: Schema.Array(DeploymentWorkflowSelection).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
})
export type DeploymentDraft = typeof DeploymentDraft.Type

export const DeploymentPreparedPlan = Schema.Struct({
  preflightId: DeploymentPreflightId,
  expiresAt: Schema.String,
  environment: AllowedDevEnvironment,
  ref: DeploymentRef,
  workflows: Schema.Array(DeploymentWorkflowSelection).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  warnings: Schema.Array(DeploymentFailureCategory),
})
export type DeploymentPreparedPlan = typeof DeploymentPreparedPlan.Type

const DeploymentPreparedResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), plan: DeploymentPreparedPlan }),
  DeploymentFailure,
])

const DeploymentPreflightInput = Schema.Struct({ preflightId: DeploymentPreflightId })

const DeploymentOperationResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), operation: DeploymentOperationSummary }),
  DeploymentFailure,
])

const DeploymentEnvironmentInput = Schema.Struct({ environment: AllowedDevEnvironment })

export const DeploymentRedeployInput = Schema.Struct({
  environment: AllowedDevEnvironment,
  expectedBranch: DeploymentRef,
  confirmed: Schema.Literal(true),
})
export type DeploymentRedeployInput = typeof DeploymentRedeployInput.Type

export const DeploymentAutoSyncInput = Schema.Struct({
  environment: AllowedDevEnvironment,
  expected: DeploymentAutoSyncState,
  enabled: Schema.Boolean,
  confirmed: Schema.Literal(true),
})
export type DeploymentAutoSyncInput = typeof DeploymentAutoSyncInput.Type

export const BocDeploymentsGetWorkspace = Rpc.make("BocDeploymentsGetWorkspace", {
  success: DeploymentWorkspaceResult,
})

export const BocDeploymentsListSystems = Rpc.make("BocDeploymentsListSystems", {
  payload: DeploymentSystemsReadInput,
  success: DeploymentSystemsResult,
})

export const BocDeploymentsCancelSystemsRead = Rpc.make("BocDeploymentsCancelSystemsRead", {
  payload: DeploymentRequestInput,
  success: Schema.Void,
})

export const BocDeploymentsGetSettings = Rpc.make("BocDeploymentsGetSettings", {
  success: DeploymentSettings,
})

export const BocDeploymentsSaveSettings = Rpc.make("BocDeploymentsSaveSettings", {
  payload: DeploymentSettings,
  success: DeploymentSettingsResult,
})

export const BocDeploymentsCheckReadiness = Rpc.make("BocDeploymentsCheckReadiness", {
  success: DeploymentReadiness,
})

export const BocDeploymentsListBranches = Rpc.make("BocDeploymentsListBranches", {
  payload: DeploymentBranchSearchInput,
  success: DeploymentBranchesResult,
})

export const BocDeploymentsListWorkflowTargets = Rpc.make("BocDeploymentsListWorkflowTargets", {
  payload: DeploymentWorkflowReadInput,
  success: DeploymentWorkflowTargetsResult,
})

export const BocDeploymentsListOperations = Rpc.make("BocDeploymentsListOperations", {
  success: DeploymentOperationsResult,
})

export const BocDeploymentsPrepareDeployment = Rpc.make("BocDeploymentsPrepareDeployment", {
  payload: DeploymentDraft,
  success: DeploymentPreparedResult,
})

export const BocDeploymentsDispatchPrepared = Rpc.make("BocDeploymentsDispatchPrepared", {
  payload: DeploymentPreflightInput,
  success: DeploymentOperationResult,
})

export const BocDeploymentsPrepareReset = Rpc.make("BocDeploymentsPrepareReset", {
  payload: DeploymentEnvironmentInput,
  success: DeploymentPreparedResult,
})

export const BocDeploymentsDispatchPreparedReset = Rpc.make("BocDeploymentsDispatchPreparedReset", {
  payload: DeploymentPreflightInput,
  success: DeploymentOperationResult,
})

export const BocDeploymentsRedeployBranch = Rpc.make("BocDeploymentsRedeployBranch", {
  payload: DeploymentRedeployInput,
  success: DeploymentOperationResult,
})

export const BocDeploymentsSetAutoSync = Rpc.make("BocDeploymentsSetAutoSync", {
  payload: DeploymentAutoSyncInput,
  success: DeploymentSystemsResult,
})

export const DeploymentRpcs = RpcGroup.make(
  BocDeploymentsGetWorkspace,
  BocDeploymentsListSystems,
  BocDeploymentsCancelSystemsRead,
  BocDeploymentsGetSettings,
  BocDeploymentsSaveSettings,
  BocDeploymentsCheckReadiness,
  BocDeploymentsListBranches,
  BocDeploymentsListWorkflowTargets,
  BocDeploymentsListOperations,
  BocDeploymentsPrepareDeployment,
  BocDeploymentsDispatchPrepared,
  BocDeploymentsPrepareReset,
  BocDeploymentsDispatchPreparedReset,
  BocDeploymentsRedeployBranch,
  BocDeploymentsSetAutoSync,
)
