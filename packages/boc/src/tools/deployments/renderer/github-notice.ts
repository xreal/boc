import type { DeploymentReadiness } from "../rpcs"

export type DeploymentGithubNotice = "cli" | "auth" | "access" | "workflows"

export function deploymentGithubNotice(readiness?: Pick<DeploymentReadiness, "capabilities">) {
  if (!readiness) return undefined
  const unavailable = (capability: string) =>
    readiness.capabilities.find((status) => status.capability === capability)?.status === "unavailable"

  if (unavailable("gh_cli")) return "cli" as const
  if (unavailable("github_auth")) return "auth" as const
  if (unavailable("github_repo_access")) return "access" as const
  if (unavailable("github_workflow_dispatch")) return "workflows" as const
  return undefined
}
