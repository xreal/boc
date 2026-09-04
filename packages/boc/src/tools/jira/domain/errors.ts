export const JIRA_ERROR_CATEGORIES = [
  "auth",
  "permission",
  "not-found",
  "rate-limit",
  "network",
  "malformed",
  "invalid-site",
  "encryption-unavailable",
] as const

export type JiraErrorCategory = (typeof JIRA_ERROR_CATEGORIES)[number]

export type JiraClientFailure = {
  ok: false
  category: JiraErrorCategory
  retryAfterSeconds?: number
}

const REDACTED = "[redacted]"

export function jiraErrorFromHttpStatus(status: number): Exclude<JiraErrorCategory, "invalid-site" | "encryption-unavailable"> {
  if (status === 400) return "malformed"
  if (status === 401) return "auth"
  if (status === 403) return "permission"
  if (status === 404) return "not-found"
  if (status === 429) return "rate-limit"
  if (status >= 500) return "network"
  return "malformed"
}

export function readRetryAfterSeconds(value: string | null) {
  if (!value) return
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds < 0) return
  return Math.floor(seconds)
}

export function failJira(category: JiraErrorCategory, retryAfterSeconds?: number): JiraClientFailure {
  if (retryAfterSeconds === undefined) return { ok: false, category }
  return { ok: false, category, retryAfterSeconds }
}

export function redactSecrets(text: string, secrets: readonly string[]) {
  const unique = [...new Set(secrets.filter((secret) => secret.length > 0))]
  const patterns = [
    /Authorization:\s*Basic\s+\S+/gi,
    /Authorization:\s*Bearer\s+\S+/gi,
    /Basic\s+[A-Za-z0-9+/=]+/g,
    ...unique.map((secret) => new RegExp(escapeRegExp(secret), "g")),
  ]
  return patterns.reduce((body, pattern) => body.replace(pattern, REDACTED), text)
}

export function containsSecret(text: string, secrets: readonly string[]) {
  return secrets.some((secret) => secret.length > 0 && text.includes(secret))
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
