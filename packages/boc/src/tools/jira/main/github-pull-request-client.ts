import { Option, Schema } from "effect"
import { runGh } from "../../deployments/main/github-cli"
import { DEPLOYMENT_GITHUB_REPOSITORY } from "../../deployments/domain/github"
import { deploymentCommandFailure } from "../../deployments/main/command-failure"
import type { DeploymentCommandRunner } from "../../deployments/main/command-runner"
import { JiraIssueKey } from "../domain/issue"
import {
  JiraPullRequest,
  githubIssueSearchUrl,
  matchesJiraBranch,
  safePullRequestUrl,
  sortPullRequests,
} from "../domain/pull-request"
import type { JiraPullRequestsResult } from "../rpcs"

const cancelled = { ok: false, category: "cancelled" } as const
type Flight = { controller: AbortController; readers: Set<symbol>; promise: Promise<JiraPullRequestsResult> }

export function createGithubPullRequestClient(run: DeploymentCommandRunner, now = Date.now) {
  const cache = new Map<string, { time: number; result: Extract<JiraPullRequestsResult, { ok: true }> }>()
  const flights = new Map<string, Flight>()
  return async (input: {
    issueKey: string
    refresh: boolean
    signal?: AbortSignal
  }): Promise<JiraPullRequestsResult> => {
    if (!Schema.is(JiraIssueKey)(input.issueKey)) return { ok: false, category: "malformed" }
    if (input.signal?.aborted) return cancelled
    const key = input.issueKey.toUpperCase()
    const cached = cache.get(key)
    if (!input.refresh && cached && now() - cached.time < 30_000) return cached.result
    const existing = flights.get(key)
    if (existing && !existing.controller.signal.aborted) return join(existing, input.signal)
    const controller = new AbortController()
    const promise = listPullRequests(run, input.issueKey.toUpperCase(), controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return cancelled
        if (result.ok) {
          cache.delete(key)
          if (cache.size >= 100) {
            const oldest = cache.keys().next().value
            if (oldest) cache.delete(oldest)
          }
          cache.set(key, { time: now(), result })
        }
        return result
      })
      .finally(() => {
        if (flights.get(key)?.promise === promise) flights.delete(key)
      })
    const flight = { controller, promise, readers: new Set<symbol>() }
    flights.set(key, flight)
    return join(flight, input.signal)
  }
}

async function listPullRequests(
  run: DeploymentCommandRunner,
  issueKey: string,
  signal: AbortSignal,
): Promise<JiraPullRequestsResult> {
  const repository = DEPLOYMENT_GITHUB_REPOSITORY
  const result = await runGh(
    { run },
    [
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      "all",
      "--search",
      `head:${issueKey}`,
      "--limit",
      "20",
      "--json",
      "number,title,url,state,isDraft,headRefName,author,updatedAt,reviewDecision",
    ],
    { signal, timeoutMs: 30_000 },
  ).catch(() => undefined)
  if (!result) return { ok: false, category: "network" }
  if (!result.ok) {
    const failure = deploymentCommandFailure(result, "github_workflow_dispatch")
    // gh's sign-in hint can appear before an HTTP request exists.
    if (/gh auth login|GH_TOKEN/.test(result.stderr)) return { ok: false, category: "not-authenticated" }
    const category = failure.category
    if (
      category === "missing-cli" ||
      category === "not-authenticated" ||
      category === "permission" ||
      category === "not-found" ||
      category === "timeout" ||
      category === "malformed" ||
      category === "cancelled" ||
      category === "network" ||
      category === "rate-limit"
    )
      return { ok: false, category }
    return { ok: false, category: "unknown" }
  }
  const requests = Option.getOrUndefined(
    Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(JiraPullRequest)))(result.stdout),
  )
  if (
    !requests ||
    requests.length > 20 ||
    requests.some(
      (request) =>
        !Number.isFinite(Date.parse(request.updatedAt)) || !safePullRequestUrl(request.url, repository, request.number),
    )
  )
    return { ok: false, category: "malformed" }
  return {
    ok: true,
    requests: sortPullRequests(requests.filter((request) => matchesJiraBranch(request.headRefName, issueKey))),
    searchUrl: githubIssueSearchUrl(repository, issueKey),
  }
}

function join(flight: Flight, signal?: AbortSignal): Promise<JiraPullRequestsResult> {
  const reader = Symbol()
  flight.readers.add(reader)
  return new Promise((resolve) => {
    const release = () => {
      signal?.removeEventListener("abort", abort)
      flight.readers.delete(reader)
    }
    const abort = () => {
      release()
      resolve(cancelled)
      queueMicrotask(() => {
        if (flight.readers.size === 0) flight.controller.abort()
      })
    }
    if (signal?.aborted) return abort()
    signal?.addEventListener("abort", abort, { once: true })
    void flight.promise.then((result) => {
      release()
      resolve(result)
    })
  })
}
