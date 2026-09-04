import type { DeploymentWorkflowTarget } from "../domain/workflows"

export const deploymentBranchFixtures = [
  "SHOP-617-product-gallery",
  "feature/SHOP-318-search-filters",
  "OPS-88-queue-observability",
] as const

export const deploymentWorkflowFixtures = [
  {
    filename: "app-shop.yml",
    name: "Shop",
    inputs: [
      { name: "perform_tests", label: "Perform tests", type: "boolean", required: true, default: true },
      { name: "force_rebuild", label: "Force image rebuild", type: "boolean", required: false, default: false },
      {
        name: "release_track",
        label: "Release track",
        type: "choice",
        required: true,
        default: "stable",
        options: ["stable", "preview"],
      },
    ],
  },
  {
    filename: "app-admin.yml",
    name: "Admin",
    inputs: [{ name: "perform_tests", label: "Perform tests", type: "boolean", required: true, default: true }],
  },
] as const satisfies readonly DeploymentWorkflowTarget[]
