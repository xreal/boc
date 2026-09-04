import { describe, expect, test } from "bun:test"
import {
  deploymentAgeSeconds,
  deploymentAvailability,
  deploymentTicketKey,
  deriveDeploymentSystem,
  formatDeploymentAge,
} from "./systems"

describe("deployment system derivations", () => {
  test("marks only empty default branches on standard systems as free", () => {
    expect(deploymentAvailability("01")).toBe("free")
    expect(deploymentAvailability("02", "main")).toBe("free")
    expect(deploymentAvailability("03", " MASTER ")).toBe("free")
    expect(deploymentAvailability("04", "SHOP-123-checkout")).toBe("occupied")
    expect(deploymentAvailability("20", "master")).toBe("reserved")
    expect(deploymentAvailability("epm")).toBe("reserved")
  })

  test("extracts a ticket only from a branch path segment prefix", () => {
    expect(deploymentTicketKey("SHOP-123-checkout")).toBe("SHOP-123")
    expect(deploymentTicketKey("feature/shop-456-new-cart")).toBe("SHOP-456")
    expect(deploymentTicketKey("feature/no-ticket")).toBeUndefined()
    expect(deploymentTicketKey("prefix-SHOP-123")).toBeUndefined()
  })

  test("derives bounded ages and compact labels", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z")
    expect(deploymentAgeSeconds("2026-09-04T11:58:30.000Z", now)).toBe(90)
    expect(deploymentAgeSeconds("2026-09-04T13:00:00.000Z", now)).toBe(0)
    expect(deploymentAgeSeconds("not-a-date", now)).toBeUndefined()
    expect(formatDeploymentAge(30)).toBe("<1m")
    expect(formatDeploymentAge(90)).toBe("1m")
    expect(formatDeploymentAge(7_200)).toBe("2h")
    expect(formatDeploymentAge(172_800)).toBe("2d")
  })

  test("projects Argo-shaped state into separate operational concepts", () => {
    expect(
      deriveDeploymentSystem(
        {
          environment: "06",
          app: "shop-dev-06",
          branch: " feature/SHOP-456-new-cart ",
          deployedAt: "2026-09-04T10:00:00.000Z",
          sync: "OutOfSync",
          health: "Progressing",
          automated: true,
          prune: false,
        },
        Date.parse("2026-09-04T12:00:00.000Z"),
      ),
    ).toEqual({
      environment: "06",
      name: "dev-06",
      app: "shop-dev-06",
      branch: "feature/SHOP-456-new-cart",
      deployedAt: "2026-09-04T10:00:00.000Z",
      ageSeconds: 7_200,
      ticketKey: "SHOP-456",
      sync: "out-of-sync",
      health: "progressing",
      autoSync: "no-prune",
      availability: "occupied",
    })
  })
})
