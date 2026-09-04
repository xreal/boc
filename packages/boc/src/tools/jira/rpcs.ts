import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const JiraErrorCategory = Schema.Literals([
  "auth",
  "permission",
  "not-found",
  "rate-limit",
  "network",
  "malformed",
  "invalid-site",
  "encryption-unavailable",
])
export type JiraErrorCategory = typeof JiraErrorCategory.Type

export const JiraConnectionInput = Schema.Struct({
  site: Schema.String,
  email: Schema.String,
  token: Schema.String,
})
export type JiraConnectionInput = typeof JiraConnectionInput.Type

export const JiraNotConfiguredStatus = Schema.Struct({
  status: Schema.Literal("not-configured"),
  encryptionAvailable: Schema.Boolean,
})

export const JiraConnectedStatus = Schema.Struct({
  status: Schema.Literal("connected"),
  encryptionAvailable: Schema.Literal(true),
  site: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
})

export const JiraEncryptionUnavailableStatus = Schema.Struct({
  status: Schema.Literal("encryption-unavailable"),
  encryptionAvailable: Schema.Literal(false),
  site: Schema.optionalKey(Schema.String),
  email: Schema.optionalKey(Schema.String),
})

export const JiraConnectionStatus = Schema.Union([
  JiraNotConfiguredStatus,
  JiraConnectedStatus,
  JiraEncryptionUnavailableStatus,
])
export type JiraConnectionStatus = typeof JiraConnectionStatus.Type

export const JiraConnectionSuccess = Schema.Struct({
  ok: Schema.Literal(true),
  status: Schema.Literal("connected"),
  site: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
})
export type JiraConnectionSuccess = typeof JiraConnectionSuccess.Type

export const JiraConnectionFailure = Schema.Struct({
  ok: Schema.Literal(false),
  category: JiraErrorCategory,
  retryAfterSeconds: Schema.optionalKey(Schema.Number),
})
export type JiraConnectionFailure = typeof JiraConnectionFailure.Type

export const JiraConnectionAttempt = Schema.Union([JiraConnectionSuccess, JiraConnectionFailure])
export type JiraConnectionAttempt = typeof JiraConnectionAttempt.Type

export const BocJiraGetConnectionStatus = Rpc.make("BocJiraGetConnectionStatus", {
  success: JiraConnectionStatus,
})

export const BocJiraTestConnection = Rpc.make("BocJiraTestConnection", {
  payload: JiraConnectionInput,
  success: JiraConnectionAttempt,
})

export const BocJiraSaveConnection = Rpc.make("BocJiraSaveConnection", {
  payload: JiraConnectionInput,
  success: JiraConnectionAttempt,
})

export const BocJiraDisconnect = Rpc.make("BocJiraDisconnect", {
  success: JiraConnectionStatus,
})

export const JiraRpcs = RpcGroup.make(
  BocJiraGetConnectionStatus,
  BocJiraTestConnection,
  BocJiraSaveConnection,
  BocJiraDisconnect,
)
