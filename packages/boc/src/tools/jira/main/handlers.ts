import { Effect } from "effect"
import { failJira } from "../domain/errors"
import { parseJiraCloudSite } from "../domain/site"
import {
  JiraRpcs,
  type JiraConnectionAttempt,
  type JiraConnectionInput,
  type JiraConnectionStatus,
  type JiraConnectionSuccess,
} from "../rpcs"
import { fetchJiraMyself, type JiraFetch } from "./client"
import { openToken, sealToken, type SecretVault } from "./credentials"
import { readStoredConnection, type JiraStore } from "./store"

export type JiraRuntime = {
  store: JiraStore
  vault: SecretVault
  fetch: JiraFetch
}

export function createJiraHandlers(runtime: JiraRuntime) {
  return JiraRpcs.toLayer(
    JiraRpcs.of({
      BocJiraGetConnectionStatus: () => Effect.sync(() => getConnectionStatus(runtime)),
      BocJiraTestConnection: (payload) => Effect.promise(() => testConnection(runtime, payload)),
      BocJiraSaveConnection: (payload) => Effect.promise(() => saveConnection(runtime, payload)),
      BocJiraDisconnect: () => Effect.sync(() => disconnect(runtime)),
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

  runtime.store.write({
    site: verified.site,
    email: verified.email,
    displayName: verified.displayName,
    tokenCiphertext,
  })
  return connectedAttempt(verified)
}

export function disconnect(runtime: JiraRuntime): JiraConnectionStatus {
  runtime.store.clear()
  return getConnectionStatus(runtime)
}

async function verifyConnection(runtime: JiraRuntime, payload: JiraConnectionInput) {
  const origin = parseJiraCloudSite(payload.site)
  if (!origin) return failJira("invalid-site")

  const email = payload.email.trim()
  const token = payload.token.trim()
  if (!email || !token) return failJira("auth")

  const result = await fetchJiraMyself({ origin, email, token, fetch: runtime.fetch })
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
