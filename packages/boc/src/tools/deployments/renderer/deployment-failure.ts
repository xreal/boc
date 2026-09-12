import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentFailure } from "../rpcs"

export function deploymentFailureMessage(t: BocTranslator, failure: DeploymentFailure) {
  if (failure.category === "conflict") return t("boc.deployments.deploy.failure.conflict")
  if (failure.category === "unsafe-target") return t("boc.deployments.deploy.failure.unsafe")
  if (failure.category === "timeout") return t("boc.deployments.deploy.failure.timeout")
  if (failure.category === "invalid-input" || failure.category === "not-found") {
    return t("boc.deployments.deploy.failure.invalid")
  }
  return t("boc.deployments.deploy.failure.generic")
}

export function workflowDiscoveryFailureMessage(t: BocTranslator, failure: DeploymentFailure) {
  if (failure.category === "missing-cli") return t("boc.deployments.deploy.workflows.failure.cli")
  if (failure.category === "not-authenticated") return t("boc.deployments.deploy.signInRequired")
  if (failure.category === "permission") return t("boc.deployments.deploy.workflows.failure.permission")
  if (failure.category === "network" || failure.category === "timeout") {
    return t("boc.deployments.deploy.connectionFailed")
  }
  if (failure.category === "rate-limit") return t("boc.deployments.deploy.workflows.failure.rateLimit")
  if (failure.category === "malformed") return t("boc.deployments.deploy.workflows.failure.malformed")
  if (failure.category === "not-found") return t("boc.deployments.deploy.workflows.empty")
  return t("boc.deployments.deploy.workflows.failure.generic")
}

export function cacheFailureMessage(
  t: BocTranslator,
  phase: "read" | "start" | "resolve",
  failure: DeploymentFailure,
) {
  if (failure.category === "unsafe-target") return t("boc.deployments.cache.failure.unsafe")
  if (failure.category === "conflict") return t("boc.deployments.cache.failure.conflict")
  if (failure.category === "timeout") return t("boc.deployments.cache.failure.timeout")
  if (failure.category === "invalid-input" || failure.category === "not-found") {
    return t("boc.deployments.cache.failure.invalid")
  }
  if (phase === "read") return t("boc.deployments.cache.failure.read")
  if (phase === "resolve") return t("boc.deployments.cache.failure.resolve")
  return t("boc.deployments.cache.failure.start")
}
