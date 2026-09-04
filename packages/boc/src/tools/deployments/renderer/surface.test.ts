import { describe, expect, test } from "bun:test"
import { deploymentSystemFixtures } from "../fixtures/systems"
import {
  deploymentFixtureMode,
  deploymentPlatformSupported,
  deploymentSurface,
  filterDeploymentSystems,
} from "./surface"

describe("deployment fleet surface", () => {
  test("prioritizes unsupported, loading, and initial errors before data states", () => {
    const input = {
      supported: true,
      ready: true,
      loading: false,
      failed: false,
      systems: deploymentSystemFixtures,
      filtered: deploymentSystemFixtures,
      narrowed: false,
    }

    expect(deploymentSurface({ ...input, supported: false })).toBe("unsupported")
    expect(deploymentSurface({ ...input, loading: true })).toBe("loading")
    expect(deploymentSurface({ ...input, ready: false, systems: [], filtered: [] })).toBe("readiness")
    expect(deploymentSurface({ ...input, failed: true, systems: [], filtered: [] })).toBe("error")
    expect(deploymentSurface({ ...input, systems: [], filtered: [] })).toBe("empty")
    expect(deploymentSurface({ ...input, filtered: [], narrowed: true })).toBe("filtered-empty")
    expect(deploymentSurface({ ...input, failed: true })).toBe("fleet")
  })

  test("searches locally and keeps reserved systems out of availability shortcuts", () => {
    expect(filterDeploymentSystems(deploymentSystemFixtures, "shop-421", "all").map((system) => system.name)).toEqual([
      "dev-04",
    ])
    expect(filterDeploymentSystems(deploymentSystemFixtures, "02", "all").map((system) => system.name)).toEqual([
      "dev-02",
    ])
    expect(filterDeploymentSystems(deploymentSystemFixtures, "", "free").map((system) => system.name)).toEqual([
      "dev-01",
      "dev-12",
    ])
    expect(
      filterDeploymentSystems(deploymentSystemFixtures, "", "occupied").some((system) => system.name === "dev-20"),
    ).toBe(false)
  })

  test("exposes deterministic fixture states and blocks Windows", () => {
    expect(deploymentFixtureMode("?fixture=stale")).toBe("stale")
    expect(deploymentFixtureMode("?fixture=unknown")).toBe("fleet")
    expect(deploymentPlatformSupported("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(true)
    expect(deploymentPlatformSupported("Mozilla/5.0 (X11; Linux x86_64)")).toBe(true)
    expect(deploymentPlatformSupported("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false)
    expect(deploymentPlatformSupported("unknown desktop")).toBe(false)
  })
})
