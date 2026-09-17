import type { Endpoint } from "@opencode/client/service"
import { BocControls } from "@boc/extensions/controls"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"
import { Option, Schema } from "effect"

const decodeControls = Schema.decodeUnknownOption(Schema.Struct({ output: BocControls.Info }))

type Inspection = {
  readonly version: string
  readonly boc: boolean
}

export type BocServicePlacement = "shared" | "isolated"

export type BocServiceLifecycle = {
  readonly version: string
  readonly mode: "initial" | "reconnect"
  readonly placement: BocServicePlacement
  readonly discoverShared: () => Promise<Endpoint | undefined>
  readonly discoverIsolated: () => Promise<Endpoint | undefined>
  readonly inspect: (endpoint: Endpoint) => Promise<Inspection>
  readonly ensureShared: () => Promise<Endpoint>
  readonly ensureIsolated: () => Promise<Endpoint>
  readonly stopShared: () => Promise<void>
  readonly stopIsolated: () => Promise<void>
}

export async function connectBocService(lifecycle: BocServiceLifecycle) {
  if (lifecycle.placement === "isolated") return connectIsolatedBocService(lifecycle)

  const shared = await lifecycle.discoverShared()
  if (!shared) return requireBocService(await lifecycle.ensureShared(), lifecycle)

  const inspection = await lifecycle.inspect(shared)
  if (inspection.boc && (lifecycle.mode === "reconnect" || inspection.version === lifecycle.version)) return shared

  await lifecycle.stopShared()
  return requireBocService(await lifecycle.ensureShared(), lifecycle)
}

export function bocServicePlacement(input: {
  readonly forcedIsolated: boolean
  readonly packaged: boolean
  readonly hasIsolatedDatabase: boolean
}): BocServicePlacement {
  if (input.forcedIsolated) return "isolated"
  if (input.packaged && input.hasIsolatedDatabase) return "isolated"
  return "shared"
}

export async function inspectBocService(
  endpoint: Endpoint,
  directory: string,
  headers?: HeadersInit,
  request: typeof fetch = fetch,
): Promise<Inspection> {
  const info = await request(new URL("/api/info", endpoint.url), { headers })
  if (!info.ok) throw new Error(`Background service info check failed with HTTP ${info.status}`)
  const infoBody: unknown = await info.json()
  if (!hasString(infoBody, "version")) throw new Error("Background service info response has no version")

  const boc =
    (await hasBackendRpc(BocEnvironmentRpc.Rpc.id, BocEnvironmentRpc.Info, endpoint, directory, headers, request)) &&
    (await hasProjectControls(endpoint, directory, headers, request))
  return { version: infoBody.version, boc }
}

async function hasBackendRpc(
  id: string,
  info: typeof BocEnvironmentRpc.Info,
  endpoint: Endpoint,
  directory: string,
  headers: HeadersInit | undefined,
  request: typeof fetch,
) {
  const url = new URL(`/api/rpc/${id}/info`, endpoint.url)
  url.searchParams.set("location[directory]", directory)
  const requestHeaders = new Headers(headers)
  requestHeaders.set("Content-Type", "application/json")
  const response = await request(url, { method: "POST", headers: requestHeaders, body: JSON.stringify({ input: {} }) })
  if (!response.ok) return false
  return Option.isSome(Schema.decodeUnknownOption(Schema.Struct({ output: info }))(await response.json()))
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

async function connectIsolatedBocService(lifecycle: BocServiceLifecycle) {
  const isolated = await lifecycle.discoverIsolated()
  if (!isolated) return requireBocService(await lifecycle.ensureIsolated(), lifecycle)

  const inspection = await lifecycle.inspect(isolated)
  if (inspection.boc && (lifecycle.mode === "reconnect" || inspection.version === lifecycle.version)) return isolated

  await lifecycle.stopIsolated()
  return requireBocService(await lifecycle.ensureIsolated(), lifecycle)
}

function hasString<T extends string>(value: unknown, key: T): value is Record<T, string> {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<PropertyKey, unknown>
  return typeof record[key] === "string"
}
