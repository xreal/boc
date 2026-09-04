import { deploymentFailure, type DeploymentCapability, type DeploymentFailure } from "../domain/failures"
import { DEPLOYMENT_KUBE_CONTEXT } from "../domain/environments"
import type { DeploymentSystem } from "../domain/systems"
import type { DeploymentCapabilityStatus, DeploymentSettings } from "../rpcs"
import { parseArgoApplications } from "./application-parser"
import type { DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"
import { platformCapability, validateDeploymentSettings } from "./readiness"

const requiredArgoFlags = ["--core", "--kube-context", "--output", "--prompts-enabled", "--selector"] as const

export type ArgoCliRuntime = {
  run: DeploymentCommandRunner
  platform: NodeJS.Platform
}

type ArgoStatuses = Partial<Record<DeploymentCapability, Omit<DeploymentCapabilityStatus, "capability">>>
type ArgoTargetVerification =
  | { ok: true; statuses: ArgoStatuses }
  | { ok: false; failure: DeploymentFailure; statuses: ArgoStatuses }

export type ArgoFleetRead =
  | {
      ok: true
      systems: readonly DeploymentSystem[]
      rejected: number
      statuses: ArgoStatuses
    }
  | {
      ok: false
      failure: DeploymentFailure
      statuses: ArgoStatuses
    }

export function argoApplicationListArgs(settings: DeploymentSettings) {
  return [
    "app",
    "list",
    "--core",
    "--kube-context",
    DEPLOYMENT_KUBE_CONTEXT,
    "--output",
    "json",
    "--prompts-enabled=false",
    "--selector",
    `${settings.applicationLabelKey}=${settings.applicationLabelValue}`,
    ...(settings.argoProject ? ["--project", settings.argoProject] : []),
  ]
}

export function supportsRequiredArgoFlags(help: string) {
  return requiredArgoFlags.every((flag) => new RegExp(`(?:^|\\s)${flag}(?:[=\\s]|$)`, "m").test(help))
}

export async function readArgoFleet(
  runtime: ArgoCliRuntime,
  settings: DeploymentSettings,
  signal?: AbortSignal,
): Promise<ArgoFleetRead> {
  const target = await verifyArgoDevTarget(runtime, settings, signal)
  if (!target.ok) return target

  const result = await runtime.run({ executable: "argocd", args: argoApplicationListArgs(settings), signal })
  if (!result.ok) {
    const failure = commandFailure(result, "argocd_list_applications")
    return {
      ok: false,
      failure,
      statuses: {
        ...target.statuses,
        argocd_auth: { status: "unavailable", failure: failure.category },
        argocd_list_applications: { status: "unavailable", failure: failure.category },
      },
    }
  }

  const parsed = parseArgoApplications(result.stdout)
  if (!parsed) {
    const failure = deploymentFailure("malformed", { capability: "argocd_list_applications" })
    return {
      ok: false,
      failure,
      statuses: {
        ...target.statuses,
        argocd_auth: { status: "available" },
        argocd_list_applications: { status: "unavailable", failure: "malformed" },
      },
    }
  }

  return {
    ok: true,
    systems: parsed.systems,
    rejected: parsed.rejected,
    statuses: {
      ...target.statuses,
      argocd_auth: { status: "available" },
      argocd_list_applications: { status: "available" },
    },
  }
}

async function verifyArgoDevTarget(
  runtime: ArgoCliRuntime,
  settings: DeploymentSettings,
  signal?: AbortSignal,
): Promise<ArgoTargetVerification> {
  const platform = platformCapability(runtime.platform)
  const settingsFailure = validateDeploymentSettings(settings)
  const statuses: ArgoStatuses = {
    platform_supported: withoutCapability(platform),
    deployment_settings: settingsFailure
      ? { status: "unavailable", failure: settingsFailure.category, context: settingsFailure.context }
      : { status: "available" },
  }
  if (platform.status !== "available") {
    return {
      ok: false as const,
      failure: deploymentFailure("unsupported-platform", { capability: "platform_supported" }),
      statuses,
    }
  }
  if (settingsFailure) return { ok: false as const, failure: settingsFailure, statuses }

  const version = await runtime.run({ executable: "argocd", args: ["version", "--client"], signal })
  if (!version.ok) {
    const failure = commandFailure(version, "argocd_cli")
    return {
      ok: false as const,
      failure,
      statuses: { ...statuses, argocd_cli: { status: "unavailable", failure: failure.category } },
    }
  }
  const installedVersion = version.stdout.match(/v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)?.[0]
  const help = await runtime.run({ executable: "argocd", args: ["app", "list", "--help"], signal })
  if (!help.ok) {
    const failure = commandFailure(help, "argocd_cli")
    return {
      ok: false as const,
      failure,
      statuses: { ...statuses, argocd_cli: { status: "unavailable", failure: failure.category } },
    }
  }
  const cli = { status: "available" as const, ...(installedVersion ? { context: { version: installedVersion } } : {}) }
  if (!supportsRequiredArgoFlags(help.stdout)) {
    const failure = deploymentFailure("unsafe-target", {
      capability: "dev_target_verified",
      context: { reason: "unsupported-flags" },
    })
    return {
      ok: false as const,
      failure,
      statuses: {
        ...statuses,
        argocd_cli: cli,
        dev_target_verified: { status: "unavailable", failure: "unsafe-target", context: failure.context },
      },
    }
  }

  const contexts = await runtime.run({
    executable: "kubectl",
    args: ["config", "get-contexts", "-o", "name"],
    signal,
  })
  if (!contexts.ok) {
    const failure = commandFailure(contexts, "dev_target_verified")
    return {
      ok: false as const,
      failure,
      statuses: {
        ...statuses,
        argocd_cli: cli,
        dev_target_verified: {
          status: "unavailable",
          failure: failure.category,
          context: { executable: "kubectl" },
        },
      },
    }
  }
  const contextNames = contexts.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
  if (!contextNames.includes(DEPLOYMENT_KUBE_CONTEXT)) {
    const failure = deploymentFailure("unsafe-target", {
      capability: "dev_target_verified",
      context: { context: DEPLOYMENT_KUBE_CONTEXT },
    })
    return {
      ok: false as const,
      failure,
      statuses: {
        ...statuses,
        argocd_cli: cli,
        dev_target_verified: { status: "unavailable", failure: "unsafe-target", context: failure.context },
      },
    }
  }

  return {
    ok: true as const,
    statuses: {
      ...statuses,
      argocd_cli: cli,
      dev_target_verified: { status: "available" as const, context: { context: DEPLOYMENT_KUBE_CONTEXT } },
    },
  }
}

function commandFailure(result: Exclude<DeploymentCommandResult, { ok: true }>, capability: DeploymentCapability) {
  if (result.reason === "not-found") return deploymentFailure("missing-cli", { capability })
  if (result.reason === "timeout") return deploymentFailure("timeout", { capability })
  if (result.reason === "cancelled") return deploymentFailure("cancelled", { capability })
  if (result.reason === "output-limit") return deploymentFailure("malformed", { capability })

  const diagnostic = `${result.stdout}\n${result.stderr}`.toLowerCase()
  if (/unauthorized|unauthenticated|authentication required|not logged in/.test(diagnostic)) {
    return deploymentFailure("not-authenticated", { capability })
  }
  if (/forbidden|permission denied|access denied/.test(diagnostic)) {
    return deploymentFailure("permission", { capability })
  }
  if (/connection refused|network|no such host|timed out/.test(diagnostic)) {
    return deploymentFailure("network", { capability })
  }
  return deploymentFailure("unknown", { capability })
}

function withoutCapability(status: DeploymentCapabilityStatus) {
  return {
    status: status.status,
    ...(status.failure ? { failure: status.failure } : {}),
    ...(status.context ? { context: status.context } : {}),
  }
}
