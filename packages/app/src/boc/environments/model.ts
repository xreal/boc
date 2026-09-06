import type { BocEnvironmentState } from "@opencode-ai/client/promise"

export type EnvironmentPrimaryIntent =
  | "configure"
  | "checking"
  | "retry-inspect"
  | "details"
  | "setup"
  | "start"
  | "open"

export function environmentPrimaryIntent(input: {
  settingsReady: boolean
  enabled: boolean
  loading: boolean
  failed: boolean
  environment?: BocEnvironmentState
}): EnvironmentPrimaryIntent {
  if (!input.settingsReady || (input.loading && !input.environment)) return "checking"
  if (!input.enabled) return "configure"
  if (!input.environment) return input.failed ? "retry-inspect" : "checking"
  if (!input.environment.availability.available) return "details"
  if (input.environment.latestRun?.status === "running") return "details"
  if (
    input.environment.latestRun?.status === "failed" ||
    input.environment.latestRun?.status === "cancelled" ||
    input.environment.latestRun?.status === "unknown"
  )
    return "details"
  if (input.environment.stack.status === "unconfigured") return "setup"
  if (input.environment.stack.status === "invalid") return "details"
  if (input.environment.containers.status === "stopped") return "start"
  if (input.environment.containers.status === "absent") return "setup"
  if (input.environment.containers.status === "partial") return "details"
  return "open"
}

export function retryableEnvironmentAction(environment?: BocEnvironmentState) {
  const run = environment?.latestRun
  if (!run || (run.status !== "failed" && run.status !== "cancelled" && run.status !== "unknown")) return
  return run.action
}

export function validEnvironmentDomain(value: string) {
  const domain = value.trim()
  if (!domain) return true
  if (domain.length > 253) return false
  if (!/^[a-zA-Z0-9.-]+$/.test(domain)) return false
  return domain
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"))
}

export function environmentDuration(startedAt: number | string, endedAt?: number | string) {
  if (typeof startedAt !== "number") return "--:--"
  const end = typeof endedAt === "number" ? endedAt : Date.now()
  const seconds = Math.max(0, Math.floor((end - startedAt) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}
