import { Schema } from "effect"
import { AllowedDevEnvironment, devSystemName, isReservedDevEnvironment } from "./environments"
import { DeploymentOperationSummary } from "./operations"

export const DeploymentSyncState = Schema.Literals(["synced", "out-of-sync", "unknown"])
export type DeploymentSyncState = typeof DeploymentSyncState.Type

export const DeploymentHealthState = Schema.Literals([
  "healthy",
  "progressing",
  "degraded",
  "suspended",
  "missing",
  "unknown",
])
export type DeploymentHealthState = typeof DeploymentHealthState.Type

export const DeploymentAutoSyncState = Schema.Literals(["on", "no-prune", "off"])
export type DeploymentAutoSyncState = typeof DeploymentAutoSyncState.Type

export const DeploymentAvailability = Schema.Literals(["free", "occupied", "reserved"])
export type DeploymentAvailability = typeof DeploymentAvailability.Type

export const DeploymentRowAction = Schema.Literals(["deploy", "reset", "redeploy", "auto-sync", "clear-cache", "ssh"])
export type DeploymentRowAction = typeof DeploymentRowAction.Type

export const DeploymentSystem = Schema.Struct({
  environment: AllowedDevEnvironment,
  name: Schema.String,
  app: Schema.String,
  branch: Schema.optionalKey(Schema.String),
  deployedRevision: Schema.optionalKey(Schema.String),
  deployedAt: Schema.optionalKey(Schema.String),
  ageSeconds: Schema.optionalKey(Schema.Number),
  ticketKey: Schema.optionalKey(Schema.String),
  sync: DeploymentSyncState,
  health: DeploymentHealthState,
  autoSync: DeploymentAutoSyncState,
  availability: DeploymentAvailability,
  operation: Schema.optionalKey(DeploymentOperationSummary),
  allowedActions: Schema.optionalKey(Schema.Array(DeploymentRowAction)),
})
export type DeploymentSystem = typeof DeploymentSystem.Type

export type DeploymentSystemSource = {
  environment: AllowedDevEnvironment
  app: string
  branch?: string
  deployedRevision?: string
  deployedAt?: string
  sync?: string
  health?: string
  automated?: boolean
  prune?: boolean
  operation?: typeof DeploymentOperationSummary.Type
}

export function deriveDeploymentSystem(source: DeploymentSystemSource, now = Date.now()): DeploymentSystem {
  const branch = source.branch?.trim() || undefined
  const ageSeconds = deploymentAgeSeconds(source.deployedAt, now)
  const ticketKey = deploymentTicketKey(branch)

  return {
    environment: source.environment,
    name: devSystemName(source.environment),
    app: source.app,
    ...(branch ? { branch } : {}),
    ...(source.deployedRevision ? { deployedRevision: source.deployedRevision } : {}),
    ...(source.deployedAt ? { deployedAt: source.deployedAt } : {}),
    ...(ageSeconds !== undefined ? { ageSeconds } : {}),
    ...(ticketKey ? { ticketKey } : {}),
    sync: deploymentSyncState(source.sync),
    health: deploymentHealthState(source.health),
    autoSync: source.automated ? (source.prune ? "on" : "no-prune") : "off",
    availability: deploymentAvailability(source.environment, branch),
    ...(source.operation ? { operation: source.operation } : {}),
  }
}

export function deploymentAvailability(environment: AllowedDevEnvironment, branch?: string): DeploymentAvailability {
  if (isReservedDevEnvironment(environment)) return "reserved"
  if (!branch || ["main", "master"].includes(branch.trim().toLowerCase())) return "free"
  return "occupied"
}

export function deploymentTicketKey(branch?: string) {
  const match = branch?.match(/(?:^|\/)([a-z][a-z0-9]+-\d+)(?=$|[-_/])/i)
  return match?.[1]?.toUpperCase()
}

export function deploymentAgeSeconds(deployedAt?: string, now = Date.now()) {
  if (!deployedAt) return undefined
  const timestamp = Date.parse(deployedAt)
  if (!Number.isFinite(timestamp)) return undefined
  return Math.max(0, Math.floor((now - timestamp) / 1000))
}

export function formatDeploymentAge(ageSeconds?: number) {
  if (ageSeconds === undefined || !Number.isFinite(ageSeconds)) return undefined
  if (ageSeconds < 60) return "<1m"
  if (ageSeconds < 60 * 60) return `${Math.floor(ageSeconds / 60)}m`
  if (ageSeconds < 24 * 60 * 60) return `${Math.floor(ageSeconds / (60 * 60))}h`
  return `${Math.floor(ageSeconds / (24 * 60 * 60))}d`
}

function deploymentSyncState(sync?: string): DeploymentSyncState {
  const normalized = sync?.replaceAll("_", "").replaceAll("-", "").toLowerCase()
  if (normalized === "synced") return "synced"
  if (normalized === "outofsync") return "out-of-sync"
  return "unknown"
}

function deploymentHealthState(health?: string): DeploymentHealthState {
  const normalized = health?.trim().toLowerCase()
  if (
    normalized === "healthy" ||
    normalized === "progressing" ||
    normalized === "degraded" ||
    normalized === "suspended" ||
    normalized === "missing"
  ) {
    return normalized
  }
  return "unknown"
}
