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
  type JiraIssuesResult,
} from "../rpcs"
import { fetchJiraBoard, fetchJiraBoardIssues, fetchJiraBoards, fetchJiraIssue, type JiraAuth } from "./board-client"
import { fetchJiraMyself, type JiraFetch, type JiraWait } from "./client"
import { openToken, sealToken, type SecretVault } from "./credentials"
import {
  readStoredConnection,
  readStoredPreferences,
  readSessionLinks,
  saveSessionLink,
  promoteSessionLink,
  type JiraStore,
} from "./store"
import { createJiraReadCoordinator, type JiraReadCoordinator } from "./read-coordinator"

export type JiraRuntime = {
  store: JiraStore
  vault: SecretVault
  fetch: JiraFetch
  wait?: JiraWait
}

export function createJiraHandlers(runtime: JiraRuntime) {
  const reads = createJiraReadCoordinator()
  return JiraRpcs.toLayer(
    JiraRpcs.of({
      BocJiraListSessionLinks: (payload) =>
        Effect.sync(() =>
          readSessionLinks(runtime.store).filter((link) => link.issueUrl === payload.issueUrl && link.sessionID),
        ),
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
      BocJiraCancelBoardRead: (payload) => Effect.sync(() => reads.cancel("board", payload.requestId)),
      BocJiraCancelIssueRead: (payload) => Effect.sync(() => reads.cancel("issue", payload.requestId)),
      BocJiraGetPreferences: () => Effect.sync(() => readStoredPreferences(runtime.store)),
      BocJiraSavePreferences: (payload) => Effect.sync(() => savePreferences(runtime, payload)),
    }),
  )
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

export async function testConnection(runtime: JiraRuntime, payload: JiraConnectionInput): Promise<JiraConnectionAttempt> {
  const verified = await verifyConnection(runtime, payload)
  if (!verified.ok) return verified
  return connectedAttempt(verified)
}

export async function saveConnection(runtime: JiraRuntime, payload: JiraConnectionInput): Promise<JiraConnectionAttempt> {
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
  return reads.run("issue", payload.requestId, (signal) => {
    const auth = storedAuth(runtime, signal)
    if (!auth.ok) return Promise.resolve(auth)
    return fetchJiraIssue(auth, payload.issueKey)
  })
}

export function savePreferences(runtime: JiraRuntime, payload: JiraPreferences) {
  const preferences = normalizeSavedBoards(payload.savedBoards, payload.defaultBoardId)
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
