import { Schema } from "effect"
import { JiraSessionLink } from "./domain/sessions"
import { Rpc, RpcGroup } from "effect/unstable/rpc"
import {
  JiraBoardIssue,
  JiraBoardSummary,
  JiraBoardView,
  JiraIssueDetail,
  JiraPreferences,
} from "./domain/board"

export {
  JiraBoardColumn,
  JiraBoardIssue,
  JiraBoardSummary,
  JiraBoardType,
  JiraBoardView,
  JiraIssueDetail,
  JiraPreferences,
  JiraSprintSummary,
} from "./domain/board"

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

const JiraReadRequestId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128))

export const JiraBoardIdInput = Schema.Struct({
  requestId: JiraReadRequestId,
  boardId: Schema.Number,
})
export type JiraBoardIdInput = typeof JiraBoardIdInput.Type

export const JiraBoardReadInput = Schema.Struct({
  requestId: JiraReadRequestId,
})
export type JiraBoardReadInput = typeof JiraBoardReadInput.Type

export const JiraBoardIssuesInput = Schema.Struct({
  requestId: JiraReadRequestId,
  boardId: Schema.Number,
  sprintId: Schema.optionalKey(Schema.Number),
})
export type JiraBoardIssuesInput = typeof JiraBoardIssuesInput.Type

export const JiraIssueKeyInput = Schema.Struct({
  requestId: JiraReadRequestId,
  issueKey: Schema.String,
})
export type JiraIssueKeyInput = typeof JiraIssueKeyInput.Type

export const JiraBoardsResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    boards: Schema.Array(JiraBoardSummary),
  }),
  JiraConnectionFailure,
])
export type JiraBoardsResult = typeof JiraBoardsResult.Type

export const JiraBoardResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    board: JiraBoardView,
  }),
  JiraConnectionFailure,
])
export type JiraBoardResult = typeof JiraBoardResult.Type

export const JiraIssuesResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    issues: Schema.Array(JiraBoardIssue),
  }),
  JiraConnectionFailure,
])
export type JiraIssuesResult = typeof JiraIssuesResult.Type

export const JiraIssueResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    issue: JiraIssueDetail,
  }),
  JiraConnectionFailure,
])
export type JiraIssueResult = typeof JiraIssueResult.Type

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

export const BocJiraListBoards = Rpc.make("BocJiraListBoards", {
  payload: JiraBoardReadInput,
  success: JiraBoardsResult,
})

export const BocJiraGetBoard = Rpc.make("BocJiraGetBoard", {
  payload: JiraBoardIdInput,
  success: JiraBoardResult,
})

export const BocJiraListIssues = Rpc.make("BocJiraListIssues", {
  payload: JiraBoardIssuesInput,
  success: JiraIssuesResult,
})

export const BocJiraGetIssue = Rpc.make("BocJiraGetIssue", {
  payload: JiraIssueKeyInput,
  success: JiraIssueResult,
})

export const BocJiraCancelBoardRead = Rpc.make("BocJiraCancelBoardRead", {
  payload: JiraBoardReadInput,
  success: Schema.Void,
})

export const BocJiraCancelIssueRead = Rpc.make("BocJiraCancelIssueRead", {
  payload: JiraBoardReadInput,
  success: Schema.Void,
})

export const BocJiraGetPreferences = Rpc.make("BocJiraGetPreferences", {
  success: JiraPreferences,
})

export const BocJiraSavePreferences = Rpc.make("BocJiraSavePreferences", {
  payload: JiraPreferences,
  success: JiraPreferences,
})

export const BocJiraListSessionLinks = Rpc.make("BocJiraListSessionLinks", {
  payload: { issueUrl: Schema.String },
  success: Schema.Array(JiraSessionLink),
})

export const BocJiraSaveSessionLink = Rpc.make("BocJiraSaveSessionLink", {
  payload: JiraSessionLink,
  success: Schema.Void,
})

export const BocJiraPromoteSessionLink = Rpc.make("BocJiraPromoteSessionLink", {
  payload: { draftID: Schema.String, server: Schema.String, sessionID: Schema.String },
  success: Schema.Void,
})

export const JiraRpcs = RpcGroup.make(
  BocJiraListSessionLinks,
  BocJiraSaveSessionLink,
  BocJiraPromoteSessionLink,
  BocJiraGetConnectionStatus,
  BocJiraTestConnection,
  BocJiraSaveConnection,
  BocJiraDisconnect,
  BocJiraListBoards,
  BocJiraGetBoard,
  BocJiraListIssues,
  BocJiraGetIssue,
  BocJiraCancelBoardRead,
  BocJiraCancelIssueRead,
  BocJiraGetPreferences,
  BocJiraSavePreferences,
)
