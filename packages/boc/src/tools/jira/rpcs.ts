import { Schema } from "effect"
import { JiraSessionLink, JiraSessionInstructions } from "./domain/sessions"
import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { JiraBoardIssue, JiraBoardSummary, JiraBoardView, JiraPreferences } from "./domain/board"
import {
  JiraIssueDetail,
  JiraIssueKey,
  JiraIssueUser,
  JiraComment,
  JiraCommentPage,
  JiraMutationFailure,
  JiraAccountId,
  JiraPageOffset,
  JiraIssueStatus,
  JIRA_ISSUE_STATUS_BATCH_SIZE,
  JiraAttachmentId,
} from "./domain/issue"
import { JiraPullRequest, JiraPullRequestFailure } from "./domain/pull-request"
export { JiraIssueDetail, JiraIssueStatus } from "./domain/issue"

export {
  JiraBoardColumn,
  JiraBoardIssue,
  JiraBoardSummary,
  JiraBoardType,
  JiraBoardView,
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

export const JiraAttachmentResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), base64: Schema.String, mimeType: Schema.String }),
  JiraConnectionFailure,
])
export type JiraAttachmentResult = typeof JiraAttachmentResult.Type

export const JiraAttachmentDownloadResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), saved: Schema.Boolean }),
  JiraConnectionFailure,
])
export type JiraAttachmentDownloadResult = typeof JiraAttachmentDownloadResult.Type

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
  issueKey: JiraIssueKey,
})
export type JiraIssueKeyInput = typeof JiraIssueKeyInput.Type

export const BocJiraPreviewAttachment = Rpc.make("BocJiraPreviewAttachment", {
  payload: { ...JiraIssueKeyInput.fields, attachmentId: JiraAttachmentId },
  success: JiraAttachmentResult,
})
export const BocJiraDownloadAttachment = Rpc.make("BocJiraDownloadAttachment", {
  payload: { ...JiraIssueKeyInput.fields, attachmentId: JiraAttachmentId },
  success: JiraAttachmentDownloadResult,
})

export const JiraIssueStatusesInput = Schema.Struct({
  requestId: JiraReadRequestId,
  issueKeys: Schema.Array(JiraIssueKey).check(Schema.isMinLength(1), Schema.isMaxLength(JIRA_ISSUE_STATUS_BATCH_SIZE)),
})
export type JiraIssueStatusesInput = typeof JiraIssueStatusesInput.Type

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

export const JiraIssueStatusesResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), statuses: Schema.Array(JiraIssueStatus) }),
  JiraConnectionFailure,
])
export type JiraIssueStatusesResult = typeof JiraIssueStatusesResult.Type

export const JiraCommentsResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), page: JiraCommentPage }),
  JiraConnectionFailure,
])
export type JiraCommentsResult = typeof JiraCommentsResult.Type
export const JiraAddCommentResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), comment: JiraComment }),
  JiraMutationFailure,
])
export type JiraAddCommentResult = typeof JiraAddCommentResult.Type
export const JiraAssigneesResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), users: Schema.Array(JiraIssueUser) }),
  JiraConnectionFailure,
])
export type JiraAssigneesResult = typeof JiraAssigneesResult.Type
export const JiraAssignResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), issue: JiraIssueDetail }),
  Schema.Struct({ ...JiraMutationFailure.fields, issue: Schema.optionalKey(JiraIssueDetail) }),
])
export type JiraAssignResult = typeof JiraAssignResult.Type
export const JiraPullRequestsResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), requests: Schema.Array(JiraPullRequest), searchUrl: Schema.String }),
  JiraPullRequestFailure,
])
export type JiraPullRequestsResult = typeof JiraPullRequestsResult.Type

export const JiraBranchesResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    branches: Schema.Array(Schema.Struct({ name: Schema.String, url: Schema.String })),
    truncated: Schema.Boolean,
  }),
  JiraPullRequestFailure,
])
export type JiraBranchesResult = typeof JiraBranchesResult.Type
export const BocJiraListBranches = Rpc.make("BocJiraListBranches", {
  payload: JiraIssueKeyInput,
  success: JiraBranchesResult,
})

export const BocJiraListComments = Rpc.make("BocJiraListComments", {
  payload: { ...JiraIssueKeyInput.fields, startAt: JiraPageOffset },
  success: JiraCommentsResult,
})
export const BocJiraSearchAssignees = Rpc.make("BocJiraSearchAssignees", {
  payload: { ...JiraIssueKeyInput.fields, query: Schema.String.check(Schema.isMaxLength(255)) },
  success: JiraAssigneesResult,
})
export const BocJiraAssignIssue = Rpc.make("BocJiraAssignIssue", {
  payload: { issueKey: JiraIssueKey, accountId: Schema.NullOr(JiraAccountId) },
  success: JiraAssignResult,
})
export const BocJiraListPullRequests = Rpc.make("BocJiraListPullRequests", {
  payload: { ...JiraIssueKeyInput.fields, refresh: Schema.Boolean },
  success: JiraPullRequestsResult,
})
export const BocJiraCancelIssueResourceRead = Rpc.make("BocJiraCancelIssueResourceRead", {
  payload: {
    requestId: JiraReadRequestId,
    resource: Schema.Literals(["comments", "assignees", "pull-requests", "issue-statuses", "attachment", "branches"]),
  },
  success: Schema.Void,
})

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

export const BocJiraListIssueStatuses = Rpc.make("BocJiraListIssueStatuses", {
  payload: JiraIssueStatusesInput,
  success: JiraIssueStatusesResult,
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

export const BocJiraGetSessionInstructions = Rpc.make("BocJiraGetSessionInstructions", {
  success: JiraSessionInstructions,
})

export const BocJiraSaveSessionInstructions = Rpc.make("BocJiraSaveSessionInstructions", {
  payload: JiraSessionInstructions,
  success: Schema.Void,
})

export const JiraRpcs = RpcGroup.make(
  BocJiraListBranches,
  BocJiraPreviewAttachment,
  BocJiraDownloadAttachment,
  BocJiraListComments,
  BocJiraSearchAssignees,
  BocJiraAssignIssue,
  BocJiraListPullRequests,
  BocJiraCancelIssueResourceRead,
  BocJiraGetSessionInstructions,
  BocJiraSaveSessionInstructions,
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
  BocJiraListIssueStatuses,
  BocJiraCancelBoardRead,
  BocJiraCancelIssueRead,
  BocJiraGetPreferences,
  BocJiraSavePreferences,
)
