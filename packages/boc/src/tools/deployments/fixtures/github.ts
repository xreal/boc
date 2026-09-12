import type { DeploymentWorkflowTarget } from "../domain/workflows"

export const deploymentBranchFixtures = [
  "SHOP-617-product-gallery",
  "feature/SHOP-318-search-filters",
  "OPS-88-queue-observability",
  "master",
] as const

export const deploymentShopWorkflowYaml = `name: Shop
on:
  workflow_dispatch:
    inputs:
      perform_tests:
        description: Perform tests
        type: boolean
        default: true
        required: true
      force_rebuild:
        description: Force image rebuild
        type: boolean
        default: false
      run_regression_tests:
        description: Run regression tests
        type: boolean
        default: false
      environment:
        description: Target environment
        type: string
        required: true
`

export const deploymentAdminWorkflowYaml = `name: Admin
on:
  workflow_dispatch:
    inputs:
      perform_tests:
        description: Perform tests
        type: boolean
        default: true
        required: true
`

export const deploymentUnsupportedWorkflowYaml = `name: Billing
on:
  workflow_dispatch:
    inputs:
      note:
        description: Release note
        type: string
        required: true
`

export const deploymentWorkflowFixtures = [
  {
    filename: "app-shop.yml",
    name: "Shop",
    inputs: [
      { name: "perform_tests", label: "Perform tests", type: "boolean", required: true, default: true },
      { name: "force_rebuild", label: "Force image rebuild", type: "boolean", required: false, default: false },
      {
        name: "run_regression_tests",
        label: "Run regression tests",
        type: "boolean",
        required: false,
        default: false,
      },
    ],
  },
  {
    filename: "app-admin.yml",
    name: "Admin",
    inputs: [{ name: "perform_tests", label: "Perform tests", type: "boolean", required: true, default: true }],
  },
] as const satisfies readonly DeploymentWorkflowTarget[]

export const deploymentWorkflowTableFixtures: readonly DeploymentWorkflowTarget[] = [
  { ...deploymentWorkflowFixtures[0], name: "app-shop" },
  ...[
    "ap",
    "catalog",
    "email",
    "jobsite",
    "legacy",
    "marketplaces",
    "oms",
    "payments",
    "recommendation",
    "reviews",
    "search",
    "stock",
    "tracking",
    "users",
  ].map((name) => ({
    filename: `app-api-${name}.yml`,
    name: `app-api-${name}`,
    inputs: deploymentWorkflowFixtures[0].inputs.slice(0, 2),
  })),
  {
    filename: "app-worker.yml",
    name: "app-worker",
    inputs: [
      {
        name: "mode",
        label: "Mode",
        type: "choice",
        required: true,
        default: "standard",
        options: ["standard", "fast"],
      },
    ],
  },
]
