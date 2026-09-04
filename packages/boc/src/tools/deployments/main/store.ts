import path from "node:path"
import { Option, Schema } from "effect"
import { pruneDeploymentHistory, DeploymentOperationSummary } from "../domain/operations"
import { DeploymentSettings } from "../rpcs"

export const DEPLOYMENT_STORE_NAME = "boc.deployments"

export const DEFAULT_DEPLOYMENT_SETTINGS: DeploymentSettings = {
  applicationLabelKey: "app",
  applicationLabelValue: "shop",
  notificationsEnabled: true,
}

const decodeSettings = Schema.decodeUnknownOption(DeploymentSettings)
const decodeOperations = Schema.decodeUnknownOption(Schema.Array(DeploymentOperationSummary))

export type DeploymentStore = {
  readSettings(): unknown
  writeSettings(settings: DeploymentSettings): void
  readOperations(): unknown
  writeOperations(operations: readonly DeploymentOperationSummary[]): void
}

export function readDeploymentSettings(store: DeploymentStore) {
  const settings = Option.getOrUndefined(decodeSettings(store.readSettings()))
  if (!settings) return DEFAULT_DEPLOYMENT_SETTINGS
  return normalizeDeploymentSettings(settings)
}

export function readDeploymentOperations(store: DeploymentStore, now = Date.now()) {
  const operations = Option.getOrUndefined(decodeOperations(store.readOperations())) ?? []
  return pruneDeploymentHistory(operations, now)
}

export function normalizeDeploymentSettings(settings: DeploymentSettings): DeploymentSettings {
  const devenvPath = settings.devenvPath?.trim()
  const argoProject = settings.argoProject?.trim()
  return {
    ...(devenvPath ? { devenvPath: path.normalize(devenvPath) } : {}),
    ...(argoProject ? { argoProject } : {}),
    applicationLabelKey: settings.applicationLabelKey.trim(),
    applicationLabelValue: settings.applicationLabelValue.trim(),
    notificationsEnabled: settings.notificationsEnabled,
  }
}

export function memoryDeploymentStore(initial?: unknown, initialOperations: unknown = []): DeploymentStore {
  let settings = initial
  let operations = initialOperations
  return {
    readSettings: () => settings,
    writeSettings: (next) => {
      settings = next
    },
    readOperations: () => operations,
    writeOperations: (next) => {
      operations = next
    },
  }
}
