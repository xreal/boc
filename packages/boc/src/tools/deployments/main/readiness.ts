import { constants } from "node:fs"
import { access, realpath } from "node:fs/promises"
import path from "node:path"
import {
  DEPLOYMENT_CAPABILITIES,
  deploymentFailure,
  type DeploymentCapability,
  type DeploymentFailure,
} from "../domain/failures"
import type { DeploymentCapabilityStatus, DeploymentReadiness, DeploymentSettings } from "../rpcs"

const fleetCapabilities = [
  "platform_supported",
  "argocd_cli",
  "dev_target_verified",
  "argocd_auth",
  "argocd_list_applications",
  "deployment_settings",
] as const satisfies readonly DeploymentCapability[]

const deploymentCapabilities = [
  ...fleetCapabilities,
  "gh_cli",
  "github_auth",
  "github_repo_access",
  "github_workflow_dispatch",
] as const satisfies readonly DeploymentCapability[]

export type DeploymentFileExists = (file: string) => Promise<boolean>
export type DeploymentFindDevenvRoot = () => Promise<string | undefined>

export function createDeploymentReadiness(
  statuses: Partial<Record<DeploymentCapability, Omit<DeploymentCapabilityStatus, "capability">>>,
): DeploymentReadiness {
  const capabilities = DEPLOYMENT_CAPABILITIES.map((capability) => ({
    capability,
    status: "unknown" as const,
    ...statuses[capability],
  }))
  const available = (capability: DeploymentCapability) =>
    capabilities.find((status) => status.capability === capability)?.status === "available"

  return {
    fleetReady: fleetCapabilities.every(available),
    deploymentReady: deploymentCapabilities.every(available),
    capabilities,
  }
}

export function platformCapability(platform: NodeJS.Platform): DeploymentCapabilityStatus {
  if (platform === "darwin" || platform === "linux") {
    return { capability: "platform_supported", status: "available" }
  }
  return {
    capability: "platform_supported",
    status: "unavailable",
    failure: "unsupported-platform",
  }
}

export function validateDeploymentSettings(settings: DeploymentSettings): DeploymentFailure | undefined {
  if (!settings.applicationLabelKey.trim() || !settings.applicationLabelValue.trim()) {
    return deploymentFailure("invalid-input", {
      capability: "deployment_settings",
      context: { field: "argoFilter" },
    })
  }
  if (settings.devenvPath && !path.isAbsolute(settings.devenvPath)) {
    return deploymentFailure("invalid-input", {
      capability: "deployment_settings",
      context: { field: "devenvPath" },
    })
  }
  if (
    [settings.argoProject, settings.applicationLabelKey, settings.applicationLabelValue]
      .filter((value): value is string => value !== undefined)
      .some(identifiesUnsafeTarget)
  ) {
    return deploymentFailure("unsafe-target", {
      capability: "deployment_settings",
      context: { field: "argoFilter" },
    })
  }
  return undefined
}

export async function autoSyncCapability(
  settings: DeploymentSettings,
  fileExists: DeploymentFileExists = deploymentFileExists,
  findDevenvRoot?: DeploymentFindDevenvRoot,
): Promise<DeploymentCapabilityStatus> {
  const devenvRoot = await resolveDevenvRoot(settings, findDevenvRoot)
  if (!devenvRoot) {
    return {
      capability: "bf_deploy_auto_sync",
      status: "unavailable",
      failure: "invalid-input",
      context: { field: "devenvPath" },
    }
  }
  if (await autoSyncEntrypoint(devenvRoot, fileExists)) {
    return { capability: "bf_deploy_auto_sync", status: "available" }
  }
  return {
    capability: "bf_deploy_auto_sync",
    status: "unavailable",
    failure: "not-found",
    context: { field: "devenvPath" },
  }
}

export async function autoSyncEntrypoint(
  devenvRoot: string,
  fileExists: DeploymentFileExists = deploymentFileExists,
) {
  const roots = [
    path.join(devenvRoot, "src", "platform", "tools", "bf-deploy"),
    path.join(devenvRoot, "src", "tools", "bf-deploy"),
  ]
  const entrypoints = await Promise.all(
    roots.map(async (root) =>
      (await Promise.all([path.join(root, "__main__.py"), path.join(root, "src", "bf_deploy.py")].map(fileExists)))
        .every(Boolean)
        ? path.join(root, "__main__.py")
        : undefined,
    ),
  )
  return entrypoints.find((entrypoint): entrypoint is string => entrypoint !== undefined)
}

export function resolveDevenvRoot(settings: DeploymentSettings, findDevenvRoot?: DeploymentFindDevenvRoot) {
  if (settings.devenvPath || !findDevenvRoot) return Promise.resolve(settings.devenvPath)
  return Promise.resolve().then(findDevenvRoot).catch(() => undefined)
}

export async function findInstalledDevenvRoot(environment: NodeJS.ProcessEnv = process.env) {
  const executable = (
    await Promise.all(
      (environment.PATH ?? "")
        .split(path.delimiter)
        .filter(Boolean)
        .map(async (directory) => {
          const candidate = path.join(directory, "devenv")
          return access(candidate, constants.X_OK).then(
            () => candidate,
            () => undefined,
          )
        }),
    )
  ).find((candidate): candidate is string => candidate !== undefined)
  if (!executable) return undefined
  const resolved = await realpath(executable).catch(() => undefined)
  return resolved ? path.dirname(resolved) : undefined
}

function identifiesUnsafeTarget(value: string) {
  return /(?:^|[./_-])(?:prod|production|stage|staging)(?:$|[./_-])/i.test(value)
}

function deploymentFileExists(file: string) {
  return access(file).then(
    () => true,
    () => false,
  )
}
