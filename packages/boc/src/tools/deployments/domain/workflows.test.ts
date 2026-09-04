import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  DeploymentWorkflowFilename,
  isDeploymentWorkflowFilename,
  normalizeDeploymentWorkflowInputs,
  type DeploymentWorkflowInputDefinition,
} from "./workflows"

const inputs = [
  { name: "perform_tests", label: "Perform tests", type: "boolean", required: true, default: true },
  {
    name: "release_track",
    label: "Release track",
    type: "choice",
    required: true,
    default: "stable",
    options: ["stable", "preview"],
  },
] as const satisfies readonly DeploymentWorkflowInputDefinition[]

describe("deployment workflow contracts", () => {
  test("accepts only active deployment workflow filename shapes", () => {
    expect(["app-shop.yml", "app-admin-api.yaml", "app-store-2.yml"].every(isDeploymentWorkflowFilename)).toBe(true)
    for (const filename of [
      "shop.yml",
      "app-.yml",
      "app-Shop.yml",
      "app-shop.json",
      "../app-shop.yml",
      "app-shop.yml.bak",
      "app_shop.yml",
    ]) {
      expect(isDeploymentWorkflowFilename(filename)).toBe(false)
      expect(() => Schema.decodeUnknownSync(DeploymentWorkflowFilename)(filename)).toThrow()
    }
  })

  test("keeps only declared values and applies typed defaults", () => {
    expect(normalizeDeploymentWorkflowInputs(inputs, { release_track: "preview" })).toEqual({
      values: { perform_tests: true, release_track: "preview" },
      issues: [],
    })
  })

  test("reports unknown, missing, and invalid inputs without coercion", () => {
    expect(
      normalizeDeploymentWorkflowInputs(
        [
          { name: "perform_tests", label: "Perform tests", type: "boolean", required: true },
          { name: "release_track", label: "Release track", type: "choice", required: true, options: ["stable"] },
        ],
        { perform_tests: "true", release_track: "preview", secret: "do-not-forward" },
      ),
    ).toEqual({
      values: {},
      issues: [
        { name: "secret", reason: "unsupported" },
        { name: "perform_tests", reason: "invalid" },
        { name: "release_track", reason: "invalid" },
      ],
    })

    expect(normalizeDeploymentWorkflowInputs(inputs.slice(0, 1), {})).toEqual({
      values: { perform_tests: true },
      issues: [],
    })
  })
})
