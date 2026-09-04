import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { DeploymentFailure, deploymentFailure } from "./failures"

describe("deployment failures", () => {
  test("normalizes retryability without carrying command diagnostics", () => {
    expect(deploymentFailure("network", { capability: "argocd_list_applications" })).toEqual({
      ok: false,
      category: "network",
      retryable: true,
      capability: "argocd_list_applications",
    })
    expect(deploymentFailure("unsafe-target").retryable).toBe(false)
    expect(JSON.stringify(DeploymentFailure.ast)).not.toMatch(/stdout|stderr|command|environment|token|authorization/i)
  })

  test("strips unknown diagnostic fields at the RPC boundary", () => {
    const decoded = Schema.decodeUnknownSync(DeploymentFailure)({
      ok: false,
      category: "permission",
      retryable: false,
      context: { target: "dev-02" },
      stderr: "sensitive output",
      token: "secret",
    })

    expect(decoded).toEqual({
      ok: false,
      category: "permission",
      retryable: false,
      context: { target: "dev-02" },
    })
  })
})
