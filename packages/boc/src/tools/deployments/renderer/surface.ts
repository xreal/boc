import type { DeploymentSystem } from "../domain/systems"

export type DeploymentAvailabilityFilter = "all" | "free" | "occupied"
export type DeploymentFixtureMode = "fleet" | "loading" | "empty" | "error" | "stale"

export function deploymentPlatformSupported(userAgent: string) {
  if (/Windows|Android/i.test(userAgent)) return false
  return /Macintosh|Mac OS X|Linux/i.test(userAgent)
}

export function deploymentFixtureMode(search: string): DeploymentFixtureMode {
  const fixture = new URLSearchParams(search).get("fixture")
  if (fixture === "loading" || fixture === "empty" || fixture === "error" || fixture === "stale") return fixture
  return "fleet"
}

export function deploymentSurface(input: {
  supported: boolean
  ready?: boolean
  loading: boolean
  failed: boolean
  systems: readonly DeploymentSystem[]
  filtered: readonly DeploymentSystem[]
  narrowed: boolean
}) {
  if (!input.supported) return "unsupported" as const
  if (input.loading) return "loading" as const
  if (input.ready === false && input.systems.length === 0) return "readiness" as const
  if (input.failed && input.systems.length === 0) return "error" as const
  if (input.systems.length === 0) return "empty" as const
  if (input.filtered.length === 0 && input.narrowed) return "filtered-empty" as const
  return "fleet" as const
}

export function filterDeploymentSystems(
  systems: readonly DeploymentSystem[],
  search: string,
  availability: DeploymentAvailabilityFilter,
) {
  const query = search.trim().toLowerCase()
  return systems.filter((system) => {
    if (availability !== "all" && system.availability !== availability) return false
    if (!query) return true
    return [system.environment, system.name, system.app, system.branch, system.ticketKey]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLowerCase().includes(query))
  })
}
