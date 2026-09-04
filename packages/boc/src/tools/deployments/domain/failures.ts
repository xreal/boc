import { Schema } from "effect"

export const DeploymentCapability = Schema.Literals([
  "platform_supported",
  "argocd_cli",
  "dev_target_verified",
  "argocd_auth",
  "argocd_list_applications",
  "deployment_settings",
  "gh_cli",
  "github_auth",
  "github_repo_access",
  "github_workflow_dispatch",
  "jira_connection",
  "bf_deploy_auto_sync",
  "ssh",
  "terminal_host",
])
export type DeploymentCapability = typeof DeploymentCapability.Type

export const DeploymentFailureCategory = Schema.Literals([
  "unsupported-platform",
  "missing-cli",
  "not-authenticated",
  "permission",
  "unsafe-target",
  "invalid-input",
  "not-found",
  "network",
  "timeout",
  "cancelled",
  "malformed",
  "conflict",
  "rate-limit",
  "partial",
  "unknown",
])
export type DeploymentFailureCategory = typeof DeploymentFailureCategory.Type

export const DeploymentFailure = Schema.Struct({
  ok: Schema.Literal(false),
  category: DeploymentFailureCategory,
  retryable: Schema.Boolean,
  capability: Schema.optionalKey(DeploymentCapability),
  context: Schema.optionalKey(Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number]))),
})
export type DeploymentFailure = typeof DeploymentFailure.Type

const RETRYABLE_FAILURES = new Set<DeploymentFailureCategory>(["network", "timeout", "rate-limit", "unknown"])

export function deploymentFailure(
  category: DeploymentFailureCategory,
  options: {
    capability?: DeploymentCapability
    context?: Readonly<Record<string, string | number>>
  } = {},
): DeploymentFailure {
  return {
    ok: false,
    category,
    retryable: RETRYABLE_FAILURES.has(category),
    ...(options.capability ? { capability: options.capability } : {}),
    ...(options.context ? { context: options.context } : {}),
  }
}
