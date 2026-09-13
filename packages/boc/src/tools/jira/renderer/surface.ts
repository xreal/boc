import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBoardIssue } from "../domain/board"
import type { JiraBoardView, JiraConnectionFailure, JiraConnectionStatus } from "../rpcs"
import { jiraConnectionErrorKey } from "./status"

export type JiraBoardSurface =
  | "offline"
  | "loading"
  | "not-configured"
  | "encryption-unavailable"
  | "rate-limit"
  | "error"
  | "no-boards"
  | "needs-default"
  | "no-sprints"
  | "empty"
  | "no-matches"
  | "board"

export function jiraBoardSurface(input: {
  online: boolean
  connection?: JiraConnectionStatus
  loading: boolean
  failure?: JiraConnectionFailure
  boards: readonly { id: number }[]
  board?: JiraBoardView
  issues: readonly JiraBoardIssue[]
  filtered: readonly JiraBoardIssue[]
  hasIssueFilters?: boolean
}): JiraBoardSurface {
  if (!input.online && !input.board) return "offline"
  if (!input.connection || input.loading) return "loading"
  if (input.connection.status === "not-configured") return "not-configured"
  if (input.connection.status === "encryption-unavailable") return "encryption-unavailable"
  if (input.failure?.category === "rate-limit") return "rate-limit"
  if (input.failure) return "error"
  if (input.boards.length === 0) return "no-boards"
  if (input.board?.type === "scrum" && input.board.sprints.length === 0) return "no-sprints"
  if (!input.board) return "needs-default"
  if (input.issues.length === 0) return "empty"
  if (input.filtered.length === 0 && input.hasIssueFilters) return "no-matches"
  return "board"
}

export function jiraBoardMessage(
  t: BocTranslator,
  surface: JiraBoardSurface,
  failure?: JiraConnectionFailure,
) {
  if (surface === "offline") return t("boc.jira.board.offline")
  if (surface === "loading") return t("boc.jira.board.loading")
  if (surface === "not-configured") return t("boc.jira.connection.notConfigured")
  if (surface === "encryption-unavailable") return t("boc.jira.connection.encryptionUnavailable")
  if (surface === "no-boards") return t("boc.jira.board.noBoards")
  if (surface === "needs-default") return t("boc.jira.board.needsDefault")
  if (surface === "no-sprints") return t("boc.jira.board.noSprints")
  if (surface === "empty") return t("boc.jira.board.empty")
  if (surface === "no-matches") return t("boc.jira.board.noMatches")
  if (surface === "rate-limit") {
    if (failure?.retryAfterSeconds !== undefined) {
      return t("boc.jira.connection.error.rate-limit.wait", { seconds: failure.retryAfterSeconds })
    }
    return t("boc.jira.connection.error.rate-limit")
  }
  if (surface === "error" && failure) return t(jiraConnectionErrorKey[failure.category])
  return t("boc.jira.board.title")
}
