import type { BocI18nKey, BocTranslator } from "../../../renderer/i18n"
import type { JiraConnectionAttempt, JiraConnectionStatus, JiraErrorCategory } from "../rpcs"

export const jiraConnectionStatusKey = {
  "not-configured": "boc.jira.connection.notConfigured",
  connected: "boc.jira.connection.connected",
  "encryption-unavailable": "boc.jira.connection.encryptionUnavailable",
} as const satisfies Record<JiraConnectionStatus["status"], BocI18nKey>

export const jiraConnectionErrorKey = {
  auth: "boc.jira.connection.error.auth",
  permission: "boc.jira.connection.error.permission",
  "not-found": "boc.jira.connection.error.not-found",
  "rate-limit": "boc.jira.connection.error.rate-limit",
  network: "boc.jira.connection.error.network",
  malformed: "boc.jira.connection.error.malformed",
  "invalid-site": "boc.jira.connection.error.invalid-site",
  "encryption-unavailable": "boc.jira.connection.error.encryption-unavailable",
} as const satisfies Record<JiraErrorCategory, BocI18nKey>

export type JiraConnectionBusy = false | "test" | "save" | "disconnect"

export function jiraStatusLabel(t: BocTranslator, status: JiraConnectionStatus) {
  if (status.status === "connected") {
    return `${t(jiraConnectionStatusKey.connected)} · ${status.email} · ${status.site}`
  }
  return t(jiraConnectionStatusKey[status.status])
}

export function jiraConnectionMessage(
  t: BocTranslator,
  input: {
    busy: JiraConnectionBusy
    notice?: "saved" | "disconnected"
    attempt?: JiraConnectionAttempt
    status?: JiraConnectionStatus
  },
) {
  if (input.busy === "test") return t("boc.jira.connection.testing")
  if (input.busy === "save") return t("boc.jira.connection.saving")
  if (input.busy === "disconnect") return t("boc.jira.connection.disconnecting")
  if (input.notice === "saved") return t("boc.jira.connection.saveSuccess")
  if (input.notice === "disconnected") return t("boc.jira.connection.disconnected")
  if (input.attempt?.ok) return t("boc.jira.connection.testSuccess")
  if (input.attempt && !input.attempt.ok) {
    if (input.attempt.category === "rate-limit" && input.attempt.retryAfterSeconds !== undefined) {
      return t("boc.jira.connection.error.rate-limit.wait", { seconds: input.attempt.retryAfterSeconds })
    }
    return t(jiraConnectionErrorKey[input.attempt.category])
  }
  if (!input.status) return t("boc.jira.connection.loading")
  return jiraStatusLabel(t, input.status)
}

export function jiraConnectionMessageKind(input: {
  busy: JiraConnectionBusy
  notice?: "saved" | "disconnected"
  attempt?: JiraConnectionAttempt
  status?: JiraConnectionStatus
}) {
  if (input.busy) return "muted"
  if (input.notice === "saved" || input.attempt?.ok) return "success"
  if (input.attempt && !input.attempt.ok) return "danger"
  if (input.status?.status === "encryption-unavailable") return "warning"
  return "muted"
}
