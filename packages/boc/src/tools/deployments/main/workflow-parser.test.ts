import { describe, expect, test } from "bun:test"
import { parseWorkflowDispatchContract } from "./workflow-parser"
import {
  deploymentAdminWorkflowYaml,
  deploymentShopWorkflowYaml,
  deploymentUnsupportedWorkflowYaml,
} from "../fixtures/github"

describe("deployment workflow YAML parser", () => {
  test("decodes supported boolean inputs and binds environment inputs", () => {
    const parsed = parseWorkflowDispatchContract({
      filename: "app-shop.yml",
      name: "Shop",
      source: deploymentShopWorkflowYaml,
    })
    expect(parsed?.target.filename).toBe("app-shop.yml")
    expect(parsed?.target.inputs.map((input) => input.name)).toEqual([
      "perform_tests",
      "force_rebuild",
      "run_regression_tests",
    ])
    expect(parsed?.boundInputs).toEqual({ environment: "environment" })
    expect(parsed?.issues).toEqual([])

    const choiceEnvironment = parseWorkflowDispatchContract({
      filename: "app-shop.yml",
      name: "Shop",
      source: `on:
  workflow_dispatch:
    inputs:
      ENVIRONMENT:
        type: choice
        required: true
        options: ['01', '02', '03', '04']
`,
    })
    expect(choiceEnvironment?.target.inputs).toEqual([])
    expect(choiceEnvironment?.boundInputs).toEqual({ ENVIRONMENT: "environment" })
    expect(choiceEnvironment?.issues).toEqual([])
  })

  test("accepts workflow_dispatch without inputs and rejects required unknown types", () => {
    expect(
      parseWorkflowDispatchContract({
        filename: "app-admin.yml",
        name: "Admin",
        source: "on: [push, workflow_dispatch]\n",
      })?.target.inputs,
    ).toEqual([])

    const unsupported = parseWorkflowDispatchContract({
      filename: "app-billing.yml",
      name: "Billing",
      source: deploymentUnsupportedWorkflowYaml,
    })
    expect(unsupported?.issues).toEqual([{ name: "note", reason: "unsupported" }])
    expect(unsupported?.target.inputs).toEqual([])
  })

  test("ignores workflows without dispatch, aliases, and oversized documents", () => {
    expect(
      parseWorkflowDispatchContract({
        filename: "app-shop.yml",
        name: "Shop",
        source: "on: push\n",
      }),
    ).toBeUndefined()
    expect(
      parseWorkflowDispatchContract({
        filename: "app-shop.yml",
        name: "Shop",
        source: "x: &a [{}, {}]\ny: [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\n",
      }),
    ).toBeUndefined()
    expect(
      parseWorkflowDispatchContract({
        filename: "app-shop.yml",
        name: "Shop",
        source: "on: workflow_dispatch\nx: " + "n".repeat(300_000),
      }),
    ).toBeUndefined()
    expect(deploymentAdminWorkflowYaml).toContain("workflow_dispatch")
  })
})
