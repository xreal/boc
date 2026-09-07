import type { DeploymentSystem } from "../domain/systems"

export function redeployMenuVisible(system: Pick<DeploymentSystem, "branch">) {
  return Boolean(system.branch && system.branch.trim().toLowerCase() !== "master")
}

export function autoSyncOffMenuVisible(system: Pick<DeploymentSystem, "autoSync">) {
  return system.autoSync === "on" || system.autoSync === "no-prune"
}
