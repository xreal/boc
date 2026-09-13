import { deriveDeploymentSystem, type DeploymentSystemSource } from "../domain/systems"
import { deploymentOperationFixtures } from "./operations"

export const DEPLOYMENT_FIXTURE_NOW = Date.parse("2026-09-04T11:12:00.000Z")

export const deploymentSystemSources = [
  {
    environment: "01",
    app: "shop-dev-01",
    branch: "master",
    deployedRevision: "17c6a55",
    deployedAt: "2026-09-04T10:48:00.000Z",
    sync: "Synced",
    health: "Healthy",
    automated: false,
  },
  {
    environment: "02",
    app: "shop-dev-02",
    branch: "SHOP-617-product-gallery",
    deployedRevision: "3909da1",
    deployedAt: "2026-09-04T09:36:00.000Z",
    sync: "Synced",
    health: "Healthy",
    automated: true,
    prune: true,
  },
  {
    environment: "03",
    app: "shop-dev-03",
    branch: "feature/OPS-88-queue-observability",
    deployedRevision: "95af512",
    deployedAt: "2026-09-03T15:04:00.000Z",
    sync: "OutOfSync",
    health: "Degraded",
    automated: false,
  },
  {
    environment: "04",
    app: "shop-dev-04",
    branch: "SHOP-421-checkout-copy",
    deployedRevision: "a643e4f",
    deployedAt: "2026-09-04T10:56:00.000Z",
    sync: "OutOfSync",
    health: "Progressing",
    automated: true,
    prune: false,
    operation: deploymentOperationFixtures[0],
  },
  {
    environment: "07",
    app: "shop-dev-07",
    branch: "feature/SHOP-318-search-filters",
    deployedRevision: "eff84c0",
    deployedAt: "2026-09-04T08:22:00.000Z",
    sync: "Synced",
    health: "Healthy",
    automated: true,
    prune: true,
    operation: deploymentOperationFixtures[1],
  },
  {
    environment: "12",
    app: "shop-dev-12",
    sync: "Unknown",
    health: "Missing",
    automated: false,
  },
  {
    environment: "20",
    app: "shop-dev-20",
    branch: "master",
    deployedAt: "2026-09-01T07:30:00.000Z",
    sync: "Synced",
    health: "Healthy",
    automated: true,
    prune: true,
  },
  {
    environment: "sap",
    app: "shop-dev-sap",
    branch: "integration/sap-catalog",
    deployedAt: "2026-09-02T12:00:00.000Z",
    sync: "Synced",
    health: "Suspended",
    automated: false,
  },
] as const satisfies readonly DeploymentSystemSource[]

export const deploymentSystemFixtures = deploymentSystemSources.map((source) =>
  deriveDeploymentSystem(source, DEPLOYMENT_FIXTURE_NOW),
)

export const deploymentTicketStatusFixtures: Readonly<Record<string, string>> = {
  "SHOP-617": "Open",
  "OPS-88": "In progress",
  "SHOP-421": "In progress",
  "SHOP-318": "Done",
}
