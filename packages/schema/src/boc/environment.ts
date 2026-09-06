import { Schema } from "effect"
import { Project } from "../project.js"
import { AbsolutePath, NonNegativeInt, optional } from "../schema.js"

export const Backend = Schema.Literal("local")
export type Backend = typeof Backend.Type

export const Strategy = Schema.Literals(["git", "boc/rift"])
export type Strategy = typeof Strategy.Type

export const Action = Schema.Literals(["setup", "start", "stop", "remove"])
export type Action = typeof Action.Type

export const RunStatus = Schema.Literals(["running", "succeeded", "failed", "cancelled", "unknown"])
export type RunStatus = typeof RunStatus.Type

export const AvailabilityReason = Schema.Literals([
  "backend-unavailable",
  "unsupported-platform",
  "checkout-unavailable",
  "checkout-not-registered",
  "checkout-not-isolated",
  "checkout-ownership-mismatch",
  "devenv-unavailable",
  "devenv-preflight-failed",
])
export type AvailabilityReason = typeof AvailabilityReason.Type

export const Availability = Schema.Union([
  Schema.Struct({ available: Schema.Literal(true), strategy: Strategy }),
  Schema.Struct({ available: Schema.Literal(false), reason: AvailabilityReason }),
]).annotate({ identifier: "BocEnvironment.Availability" })
export type Availability = typeof Availability.Type

export interface Run extends Schema.Schema.Type<typeof Run> {}
export const Run = Schema.Struct({
  id: Schema.String,
  action: Action,
  status: RunStatus,
  startedAt: Schema.Number,
  endedAt: optional(Schema.Number),
  exitCode: optional(Schema.Number),
  log: Schema.String,
  truncated: Schema.Boolean,
}).annotate({ identifier: "BocEnvironment.Run" })

export const Stack = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unconfigured") }),
  Schema.Struct({ status: Schema.Literal("invalid") }),
  Schema.Struct({
    status: Schema.Literal("configured"),
    stackID: Schema.String,
    composeProject: Schema.String,
    infrastructureProject: Schema.String,
    host: Schema.String,
    url: Schema.String,
    sourceDirectory: AbsolutePath,
  }),
]).annotate({ identifier: "BocEnvironment.Stack" })
export type Stack = typeof Stack.Type

export interface Containers extends Schema.Schema.Type<typeof Containers> {}
export const Containers = Schema.Struct({
  status: Schema.Literals(["unknown", "absent", "stopped", "running", "partial"]),
  total: NonNegativeInt,
  running: NonNegativeInt,
}).annotate({ identifier: "BocEnvironment.Containers" })

export const HttpReadiness = Schema.Union([
  Schema.Struct({ status: Schema.Literal("unknown") }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    checkedAt: Schema.Number,
    statusCode: NonNegativeInt,
  }),
  Schema.Struct({ status: Schema.Literal("unreachable"), checkedAt: Schema.Number }),
]).annotate({ identifier: "BocEnvironment.HttpReadiness" })
export type HttpReadiness = typeof HttpReadiness.Type

export interface State extends Schema.Schema.Type<typeof State> {}
export const State = Schema.Struct({
  backend: Backend,
  projectID: Project.ID,
  directory: AbsolutePath,
  availability: Availability,
  stack: Stack,
  containers: Containers,
  http: HttpReadiness,
  latestRun: optional(Run),
}).annotate({ identifier: "BocEnvironment.State" })

export const OperationResult = Schema.Union([
  Schema.Struct({ accepted: Schema.Literal(true), environment: State }),
  Schema.Struct({
    accepted: Schema.Literal(false),
    reason: Schema.Literals(["operation-running", "not-available", "not-configured", "confirmation-required"]),
    environment: State,
  }),
]).annotate({ identifier: "BocEnvironment.OperationResult" })
export type OperationResult = typeof OperationResult.Type

export interface CancelResult extends Schema.Schema.Type<typeof CancelResult> {}
export const CancelResult = Schema.Struct({ cancelled: Schema.Boolean, environment: State }).annotate({
  identifier: "BocEnvironment.CancelResult",
})
