import type { DeploymentOperationSummary } from "../domain/operations"

export const deploymentOperationFixtures = [
  {
    id: "operation-checkout-421",
    environment: "04",
    branch: "SHOP-421-checkout-copy",
    ticketKey: "SHOP-421",
    workflows: [
      {
        filename: "app-shop.yml",
        state: "in-progress",
        runId: "8421042",
        runUrl: "https://github.example.invalid/bergfreunde/deploy/actions/runs/8421042",
      },
    ],
    state: "in-progress",
    createdAt: "2026-09-04T10:56:00.000Z",
    updatedAt: "2026-09-04T11:08:00.000Z",
  },
  {
    id: "operation-search-318",
    environment: "07",
    branch: "feature/SHOP-318-search-filters",
    ticketKey: "SHOP-318",
    workflows: [{ filename: "app-shop.yml", state: "success" }],
    state: "success",
    createdAt: "2026-09-04T08:14:00.000Z",
    updatedAt: "2026-09-04T08:22:00.000Z",
  },
] as const satisfies readonly DeploymentOperationSummary[]
