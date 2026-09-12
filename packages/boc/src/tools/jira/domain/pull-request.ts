import { Schema } from "effect"

export const JiraPullRequest = Schema.Struct({
  number: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1)),
  title: Schema.String,
  url: Schema.String,
  state: Schema.Literals(["OPEN", "MERGED", "CLOSED"]),
  isDraft: Schema.Boolean,
  headRefName: Schema.String,
  author: Schema.NullOr(Schema.Struct({ login: Schema.String })),
  updatedAt: Schema.String,
  reviewDecision: Schema.NullOr(Schema.Literals(["", "APPROVED", "CHANGES_REQUESTED", "REVIEW_REQUIRED"])),
})
export type JiraPullRequest = typeof JiraPullRequest.Type

export const JiraPullRequestFailure = Schema.Struct({
  ok: Schema.Literal(false),
  category: Schema.Literals([
    "missing-cli",
    "not-authenticated",
    "permission",
    "not-found",
    "timeout",
    "malformed",
    "cancelled",
    "network",
    "rate-limit",
    "unknown",
  ]),
})
export type JiraPullRequestFailure = typeof JiraPullRequestFailure.Type

export function matchesJiraBranch(branch: string, issueKey: string) {
  return branch.toUpperCase().startsWith(`${issueKey.toUpperCase()}-`)
}

export function safePullRequestUrl(value: string, repository: string, number: number) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    !url.port &&
    !url.username &&
    !url.password &&
    url.pathname.toLowerCase() === `/${repository}/pull/${number}`.toLowerCase() &&
    !url.search &&
    !url.hash
  )
}

export function sortPullRequests(requests: readonly JiraPullRequest[]) {
  return [...requests].sort(
    (left, right) =>
      Number(right.state === "OPEN") - Number(left.state === "OPEN") ||
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      right.number - left.number,
  )
}

export function githubIssueSearchUrl(repository: string, key: string) {
  return `https://github.com/${repository}/pulls?q=${encodeURIComponent(`is:pr head:${key.toUpperCase()}`)}`
}
