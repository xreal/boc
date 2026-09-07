import type { Endpoint } from "@opencode-ai/client/service"
import { BocControls } from "@boc/extensions/controls"
import { Option, Schema } from "effect"

const decodeControls = Schema.decodeUnknownOption(Schema.Struct({ output: BocControls.Info }))

type Inspection = {
  readonly version: string
  readonly boc: boolean
}

export type BocServiceLifecycle = {
  readonly version: string
  readonly mode: "initial" | "reconnect"
  readonly discoverShared: () => Promise<Endpoint | undefined>
  readonly discoverIsolated: () => Promise<Endpoint | undefined>
  readonly inspect: (endpoint: Endpoint) => Promise<Inspection>
  readonly ensureShared: () => Promise<Endpoint>
  readonly ensureIsolated: () => Promise<Endpoint>
  readonly stopShared: () => Promise<void>
  readonly stopIsolated: () => Promise<void>
}

export async function connectBocService(lifecycle: BocServiceLifecycle) {
  const shared = await lifecycle.discoverShared()
  if (!shared) {
    const isolated = await availableIsolated(lifecycle)
    if (isolated) return isolated
    return requireBocService(await lifecycle.ensureShared(), lifecycle)
  }

  const inspection = await lifecycle.inspect(shared)
  if (inspection.boc && (lifecycle.mode === "reconnect" || inspection.version === lifecycle.version)) return shared
  if (!inspection.boc) {
    const isolated = await availableIsolated(lifecycle)
    if (isolated) return isolated
  }
  if (!inspection.boc && inspection.version !== lifecycle.version) {
    return requireBocService(await lifecycle.ensureIsolated(), lifecycle)
  }

  await lifecycle.stopShared()
  const replacement = await lifecycle.ensureShared()
  if ((await lifecycle.inspect(replacement)).boc) return replacement
  return requireBocService(await lifecycle.ensureIsolated(), lifecycle)
}

export async function inspectBocService(
  endpoint: Endpoint,
  directory: string,
  headers?: HeadersInit,
  request: typeof fetch = fetch,
): Promise<Inspection> {
  const health = await request(new URL("/api/health", endpoint.url), { headers })
  if (!health.ok) throw new Error(`Background service health check failed with HTTP ${health.status}`)
  const healthBody: unknown = await health.json()
  if (!hasString(healthBody, "version")) throw new Error("Background service health response has no version")

  const boc =
    (await hasRiftBackend(endpoint, directory, headers, request)) &&
    (await hasProjectControls(endpoint, directory, headers, request))
  return { version: healthBody.version, boc }
}

async function hasRiftBackend(
  endpoint: Endpoint,
  directory: string,
  headers: HeadersInit | undefined,
  request: typeof fetch,
) {
  const url = new URL("/api/boc/worktree/boc-desktop/rift-capability", endpoint.url)
  url.searchParams.set("source", directory)
  url.searchParams.set("directory", directory)
  const response = await request(url, { headers })
  if (!response.ok) return false
  const body: unknown = await response.json()
  if (!hasBoolean(body, "available")) return false
  if (body.available) return true
  return hasString(body, "reason") && body.reason !== "backend-unavailable"
}

async function hasProjectControls(
  endpoint: Endpoint,
  directory: string,
  headers: HeadersInit | undefined,
  request: typeof fetch,
) {
  const url = new URL(`/api/rpc/${BocControls.Rpc.id}/info`, endpoint.url)
  url.searchParams.set("location[directory]", directory)
  const requestHeaders = new Headers(headers)
  requestHeaders.set("Content-Type", "application/json")
  const response = await request(url, {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify({ input: {} }),
  })
  if (!response.ok) return false
  const info = decodeControls(await response.json())
  return Option.isSome(info) && info.value.output.operations.includes("getState")
}

async function requireBocService(endpoint: Endpoint, lifecycle: BocServiceLifecycle) {
  if ((await lifecycle.inspect(endpoint)).boc) return endpoint
  throw new Error("Boc background service did not provide its backend capabilities")
}

async function availableIsolated(lifecycle: BocServiceLifecycle) {
  const isolated = await lifecycle.discoverIsolated()
  if (!isolated) return undefined
  const inspection = await lifecycle.inspect(isolated)
  if (!inspection.boc) {
    await lifecycle.stopIsolated()
    return requireBocService(await lifecycle.ensureIsolated(), lifecycle)
  }
  if (lifecycle.mode === "reconnect" || inspection.version === lifecycle.version) return isolated
  return requireBocService(await lifecycle.ensureIsolated(), lifecycle)
}

function hasString<T extends string>(value: unknown, key: T): value is Record<T, string> {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, key) === "string"
}

function hasBoolean<T extends string>(value: unknown, key: T): value is Record<T, boolean> {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, key) === "boolean"
}
