import { describe, expect, test } from "bun:test"
import { argoApplicationFixtures } from "../fixtures/argo"
import { parseArgoApplications } from "./application-parser"

describe("Argo application parser", () => {
  test("projects only allowlisted development applications", () => {
    const result = parseArgoApplications(JSON.stringify(argoApplicationFixtures), Date.parse("2026-09-04T10:36:00Z"))

    expect(result?.systems).toEqual([
      {
        environment: "02",
        name: "dev-02",
        app: "shop-dev-02",
        branch: "SHOP-617-product-gallery",
        deployedRevision: "3909da1",
        deployedAt: "2026-09-04T09:36:00.000Z",
        ageSeconds: 3600,
        ticketKey: "SHOP-617",
        sync: "synced",
        health: "healthy",
        autoSync: "on",
        availability: "occupied",
      },
    ])
    expect(result?.rejected).toBe(1)
  })

  test("accepts exact environment namespaces and prefers the branch label", () => {
    const result = parseArgoApplications(
      JSON.stringify([
        {
          metadata: { name: "shop", labels: { app: "shop", branch: "PLAT-42-labeled" } },
          spec: { destination: { namespace: "epm" }, source: { targetRevision: "master" } },
          status: { sync: { status: "OutOfSync" }, health: { status: "Progressing" } },
        },
      ]),
    )

    expect(result?.systems[0]).toMatchObject({
      environment: "epm",
      branch: "PLAT-42-labeled",
      ticketKey: "PLAT-42",
      availability: "reserved",
      sync: "out-of-sync",
      health: "progressing",
    })
  })

  test("rejects malformed JSON, malformed entries, and near-miss environments", () => {
    expect(parseArgoApplications("not-json")).toBeUndefined()
    const result = parseArgoApplications(
      JSON.stringify([
        null,
        { metadata: { name: "shop-dev-17" }, spec: {} },
        { metadata: { name: "shop-production", labels: { environment: "production" } }, spec: {} },
        {
          metadata: { name: "shop-production", labels: { environment: "02" } },
          spec: { destination: { namespace: "02" } },
        },
      ]),
    )
    expect(result).toEqual({ systems: [], rejected: 4 })
  })
})
