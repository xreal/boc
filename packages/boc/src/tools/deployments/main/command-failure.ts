import { deploymentFailure, type DeploymentCapability } from "../domain/failures"
import type { DeploymentCommandResult } from "./command-runner"

export function deploymentCommandFailure(
  result: Exclude<DeploymentCommandResult, { ok: true }>,
  capability: DeploymentCapability,
) {
  if (result.reason === "not-found") return deploymentFailure("missing-cli", { capability })
  if (result.reason === "timeout") return deploymentFailure("timeout", { capability })
  if (result.reason === "cancelled") return deploymentFailure("cancelled", { capability })
  if (result.reason === "output-limit") return deploymentFailure("malformed", { capability })

  const diagnostic = `${result.stdout}\n${result.stderr}`.toLowerCase()
  if (/unauthorized|unauthenticated|authentication required|not logged in|http\s*401/.test(diagnostic)) {
    return deploymentFailure("not-authenticated", { capability })
  }
  if (/rate limit|http\s*429/.test(diagnostic)) {
    return deploymentFailure("rate-limit", { capability })
  }
  if (/forbidden|permission denied|access denied|http\s*403/.test(diagnostic)) {
    return deploymentFailure("permission", { capability })
  }
  if (/not found|http\s*404/.test(diagnostic)) {
    return deploymentFailure("not-found", { capability })
  }
  if (/connection refused|network|no such host|timed out/.test(diagnostic)) {
    return deploymentFailure("network", { capability })
  }
  return deploymentFailure("unknown", { capability })
}
