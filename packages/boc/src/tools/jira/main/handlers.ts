import { Effect } from "effect"
import { normalizeSavedBoards, type JiraPreferences } from "../domain/board"
import { failJira, type JiraClientFailure } from "../domain/errors"
import { parseJiraCloudSite } from "../domain/site"
import {
  JiraRpcs,
  type JiraBoardIdInput,
  type JiraBoardIssuesInput,
  type JiraBoardReadInput,
  type JiraBoardResult,
  type JiraBoardsResult,
  type JiraConnectionAttempt,
  type JiraConnectionInput,
  type JiraConnectionStatus,
  type JiraConnectionSuccess,
  type JiraIssueKeyInput,
  type JiraIssueResult,
  type JiraIssueStatusesResult,
  type JiraIssuesResult,
} from "../rpcs"
import { fetchJiraBoard, fetchJiraBoardIssues, fetchJiraBoards, fetchStoryPointFieldIds } from "./board-client"
import { fetchJiraMyself, type JiraAuth, type JiraFetch, type JiraWait } from "./client"
import {
  assignJiraIssue,
  fetchJiraComments,
  fetchJiraIssue,
  fetchJiraIssueStatuses,
  searchJiraAssignees,
} from "./issue-client"
import { createGithubPullRequestClient } from "./github-pull-request-client"
import type { DeploymentCommandRunner } from "../../deployments/main/command-runner"
import { openToken, sealToken, type SecretVault } from "./credentials"
import {
  readStoredConnection,
  readStoredPreferences,
  readSessionInstructions,
  readSessionLinks,
  saveSessionLink,
  promoteSessionLink,
  type JiraStore,
} from "./store"
import { JIRA_ISSUE_STATUS_CACHE_MS } from "../domain/issue"
import { createJiraReadCoordinator, type JiraReadCoordinator } from "./read-coordinator"
import { fetchJiraAttachment, previewJiraAttachment } from "./attachment-client"
import { fetchJiraBranches } from "./github-branch-client"
import type { JiraAttachmentDownloadResult } from "../rpcs"

export type JiraRuntime = {
  store: JiraStore
  vault: SecretVault
  fetch: JiraFetch
  wait?: JiraWait
  run?: DeploymentCommandRunner
  now?: () => number
  saveAttachment?: (filename: string, response: Response) => Promise<JiraAttachmentDownloadResult>
}

export function createJiraHandlers(runtime: JiraRuntime) {
  const reads = createJiraReadCoordinator()
  const pullRequests = runtime.run ? createGithubPullRequestClient(runtime.run) : undefined
  const issueStatusCache = new Map<string, CachedJiraIssueStatus>()
  const now = runtime.now ?? Date.now
  return JiraRpcs.toLayer(
    JiraRpcs.of({
      BocJiraListBranches: (payload) =>
        Effect.promise(() =>
          reads.run("branches", payload.requestId, async (signal) =>
            runtime.run
              ? fetchJiraBranches(runtime.run, payload.issueKey, signal)
              : { ok: false as const, category: "missing-cli" as const },
          ),
        ),
      BocJiraPreviewAttachment: (payload) =>
        Effect.promise(() =>
          reads.run("attachment", payload.requestId, async (signal) => {
            const auth = storedAuth(runtime, signal)
            return auth.ok ? previewJiraAttachment(auth, payload) : auth
          }),
        ),
      BocJiraDownloadAttachment: (payload) =>
        Effect.promise(async () => {
          const auth = storedAuth(runtime)
          if (!auth.ok) return auth
          if (!runtime.saveAttachment) return failJira("network")
          const result = await fetchJiraAttachment(auth, payload)
          if (!result.ok) return result
          return runtime.saveAttachment(result.attachment.filename, result.response).catch(async () => {
            await result.response.body?.cancel().catch(() => undefined)
            return failJira("network")
          })
        }),
      BocJiraListComments: (payload) =>
        Effect.promise(() =>
          reads.run("comments", payload.requestId, async (signal) => {
            const auth = storedAuth(runtime, signal)
            return auth.ok ? fetchJiraComments(auth, payload) : auth
          }),
        ),
      BocJiraSearchAssignees: (payload) =>
        Effect.promise(() =>
          reads.run("assignees", payload.requestId, async (signal) => {
            const auth = storedAuth(runtime, signal)
            return auth.ok ? searchJiraAssignees(auth, payload) : auth
          }),
        ),
      BocJiraAssignIssue: (payload) =>
        Effect.promise(async () => {
          const auth = storedAuth(runtime)
          return auth.ok ? assignJiraIssue(auth, payload) : { ...auth, outcome: "rejected" as const }
        }),
      BocJiraListPullRequests: (payload) =>
        Effect.promise(() =>
          reads.run("pull-requests", payload.requestId, async (signal) => {
            if (!pullRequests) return { ok: false as const, category: "missing-cli" as const }
            return pullRequests({ ...payload, signal })
          }),
        ),
      BocJiraCancelIssueResourceRead: (payload) => Effect.sync(() => reads.cancel(payload.resource, payload.requestId)),
      BocJiraGetSessionInstructions: () => Effect.sync(() => readSessionInstructions(runtime.store)),
      BocJiraSaveSessionInstructions: (payload) => Effect.sync(() => runtime.store.writeSessionInstructions(payload)),
      BocJiraListSessionLinks: (payload) =>
        Effect.sync(() =>
          readSessionLinks(runtime.store).filter((link) => link.issueUrl === payload.issueUrl && link.sessionID),
        ),
      BocJiraListSessionCounts: () =>
        Effect.sync(() => {
          const counts = readSessionLinks(runtime.store)
            .filter((link) => link.sessionID)
            .reduce(
              (result, link) => result.set(link.issueUrl, (result.get(link.issueUrl) ?? 0) + 1),
              new Map<string, number>(),
            )
          return [...counts].map(([issueUrl, count]) => ({ issueUrl, count }))
        }),
      BocJiraSaveSessionLink: (payload) => Effect.sync(() => saveSessionLink(runtime.store, payload)),
      BocJiraPromoteSessionLink: (payload) => Effect.sync(() => promoteSessionLink(runtime.store, payload)),
      BocJiraGetConnectionStatus: () => Effect.sync(() => getConnectionStatus(runtime)),
      BocJiraTestConnection: (payload) => Effect.promise(() => testConnection(runtime, payload)),
      BocJiraSaveConnection: (payload) => Effect.promise(() => saveConnection(runtime, payload)),
      BocJiraDisconnect: () => Effect.sync(() => disconnect(runtime)),
      BocJiraListBoards: (payload) => Effect.promise(() => listBoards(runtime, reads, payload)),
      BocJiraGetBoard: (payload) => Effect.promise(() => getBoard(runtime, reads, payload)),
      BocJiraListIssues: (payload) => Effect.promise(() => listIssues(runtime, reads, payload)),
      BocJiraGetIssue: (payload) => Effect.promise(() => getIssue(runtime, reads, payload)),
      BocJiraListIssueStatuses: (payload) =>
        Effect.promise(() =>
          reads.run("issue-statuses", payload.requestId, async (signal) => {
            const auth = storedAuth(runtime, signal)
            return auth.ok ? readCachedIssueStatuses(auth, payload.issueKeys, issueStatusCache, now) : auth
          }),
        ),
      BocJiraCancelBoardRead: (payload) => Effect.sync(() => reads.cancel("board", payload.requestId)),
      BocJiraCancelIssueRead: (payload) => Effect.sync(() => reads.cancel("issue", payload.requestId)),
      BocJiraGetPreferences: () => Effect.sync(() => readStoredPreferences(runtime.store)),
      BocJiraSavePreferences: (payload) => Effect.sync(() => savePreferences(runtime, payload)),
    }),
  )
}

type CachedJiraIssueStatus = {
  fetchedAt: number
  statusName?: string
}

async function readCachedIssueStatuses(
  auth: JiraAuth,
  issueKeys: readonly string[],
  cache: Map<string, CachedJiraIssueStatus>,
  now: () => number,
): Promise<JiraIssueStatusesResult> {
  const keys = [...new Set(issueKeys.map((key) => key.trim().toUpperCase()))]
  const currentTime = now()
  const fresh = new Set(
    keys.filter((key) => {
      const cached = cache.get(jiraIssueStatusCacheKey(auth, key))
      return cached !== undefined && currentTime - cached.fetchedAt < JIRA_ISSUE_STATUS_CACHE_MS
    }),
  )
  const missing = keys.filter((key) => !fresh.has(key))

  if (missing.length > 0) {
    const result = await fetchJiraIssueStatuses(auth, missing)
    const fetchedAt = now()
    if (!result.ok) {
      if (auth.signal?.aborted) return result
      for (const key of missing) {
        const previous = cache.get(jiraIssueStatusCacheKey(auth, key))
        cache.set(jiraIssueStatusCacheKey(auth, key), {
          fetchedAt,
          ...(previous?.statusName ? { statusName: previous.statusName } : {}),
        })
      }
      return result
    }

    const statuses = new Map(result.statuses.map((status) => [status.key.toUpperCase(), status.statusName]))
    for (const key of missing) {
      const statusName = statuses.get(key)
      cache.set(jiraIssueStatusCacheKey(auth, key), {
        fetchedAt,
        ...(statusName ? { statusName } : {}),
      })
    }
  }

  return {
    ok: true,
    statuses: keys.flatMap((key) => {
      const statusName = cache.get(jiraIssueStatusCacheKey(auth, key))?.statusName
      return statusName ? [{ key, statusName }] : []
    }),
  }
}

function jiraIssueStatusCacheKey(auth: JiraAuth, issueKey: string) {
  return `${auth.origin.origin}:${auth.email.trim().toLowerCase()}:${issueKey}`
}

export function getConnectionStatus(runtime: JiraRuntime): JiraConnectionStatus {
  const encryptionAvailable = runtime.vault.isEncryptionAvailable()
  const stored = readStoredConnection(runtime.store)
  if (!stored) return { status: "not-configured", encryptionAvailable }
  if (!encryptionAvailable) {
    return {
      status: "encryption-unavailable",
      encryptionAvailable: false,
      site: stored.site,
      email: stored.email,
    }
  }
  if (!openToken(runtime.vault, stored.tokenCiphertext)) {
    return { status: "not-configured", encryptionAvailable }
  }
  return {
    status: "connected",
    encryptionAvailable: true,
    site: stored.site,
    email: stored.email,
    displayName: stored.displayName,
  }
}

export async function testConnection(
  runtime: JiraRuntime,
  payload: JiraConnectionInput,
): Promise<JiraConnectionAttempt> {
  const verified = await verifyConnection(runtime, payload)
  if (!verified.ok) return verified
  return connectedAttempt(verified)
}

export async function saveConnection(
  runtime: JiraRuntime,
  payload: JiraConnectionInput,
): Promise<JiraConnectionAttempt> {
  const verified = await verifyConnection(runtime, payload)
  if (!verified.ok) return verified
  if (!runtime.vault.isEncryptionAvailable()) return failJira("encryption-unavailable")

  const tokenCiphertext = sealToken(runtime.vault, payload.token.trim())
  if (!tokenCiphertext) return failJira("encryption-unavailable")

  const previous = readStoredConnection(runtime.store)
  runtime.store.write({
    site: verified.site,
    email: verified.email,
    displayName: verified.displayName,
    tokenCiphertext,
  })
  if (previous && previous.site !== verified.site) runtime.store.writePreferences({ savedBoards: [] })
  return connectedAttempt(verified)
}

export function disconnect(runtime: JiraRuntime): JiraConnectionStatus {
  runtime.store.clear()
  return getConnectionStatus(runtime)
}

export async function listBoards(
  runtime: JiraRuntime,
  reads: JiraReadCoordinator,
  payload: JiraBoardReadInput,
): Promise<JiraBoardsResult> {
  return reads.run("board", payload.requestId, (signal) => {
    const auth = storedAuth(runtime, signal)
    if (!auth.ok) return Promise.resolve(auth)
    return fetchJiraBoards(auth)
  })
}

export async function getBoard(
  runtime: JiraRuntime,
  reads: JiraReadCoordinator,
  payload: JiraBoardIdInput,
): Promise<JiraBoardResult> {
  return reads.run("board", payload.requestId, (signal) => {
    const auth = storedAuth(runtime, signal)
    if (!auth.ok) return Promise.resolve(auth)
    return fetchJiraBoard(auth, payload.boardId)
  })
}

export async function listIssues(
  runtime: JiraRuntime,
  reads: JiraReadCoordinator,
  payload: JiraBoardIssuesInput,
): Promise<JiraIssuesResult> {
  return reads.run("board", payload.requestId, (signal) => {
    const auth = storedAuth(runtime, signal)
    if (!auth.ok) return Promise.resolve(auth)
    return fetchJiraBoardIssues(auth, payload)
  })
}

export async function getIssue(
  runtime: JiraRuntime,
  reads: JiraReadCoordinator,
  payload: JiraIssueKeyInput,
): Promise<JiraIssueResult> {
  return reads.run("issue", payload.requestId, async (signal) => {
    const auth = storedAuth(runtime, signal)
    if (!auth.ok) return Promise.resolve(auth)
    return fetchJiraIssue(auth, payload.issueKey, await fetchStoryPointFieldIds(auth))
  })
}

export function savePreferences(runtime: JiraRuntime, payload: JiraPreferences) {
  const preferences = normalizeSavedBoards(payload.savedBoards, payload.defaultBoardId, payload.projectTargets)
  runtime.store.writePreferences(preferences)
  return preferences
}

function storedAuth(runtime: JiraRuntime, signal?: AbortSignal): ({ ok: true } & JiraAuth) | JiraClientFailure {
  const stored = readStoredConnection(runtime.store)
  if (!stored) return failJira("auth")
  if (!runtime.vault.isEncryptionAvailable()) return failJira("encryption-unavailable")
  const token = openToken(runtime.vault, stored.tokenCiphertext)
  if (!token) return failJira("auth")
  const origin = parseJiraCloudSite(stored.site)
  if (!origin) return failJira("invalid-site")
  return { ok: true, origin, email: stored.email, token, fetch: runtime.fetch, signal, wait: runtime.wait }
}

async function verifyConnection(runtime: JiraRuntime, payload: JiraConnectionInput) {
  const origin = parseJiraCloudSite(payload.site)
  if (!origin) return failJira("invalid-site")

  const email = payload.email.trim()
  const token = payload.token.trim()
  if (!email || !token) return failJira("auth")

  const result = await fetchJiraMyself({ origin, email, token, fetch: runtime.fetch, wait: runtime.wait })
  if (!result.ok) return result

  return {
    ok: true as const,
    site: origin.site,
    email,
    displayName: result.user.displayName.trim() || email,
  }
}

function connectedAttempt(verified: { site: string; email: string; displayName: string }): JiraConnectionSuccess {
  return {
    ok: true,
    status: "connected",
    site: verified.site,
    email: verified.email,
    displayName: verified.displayName,
  }
}
