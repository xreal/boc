import { describe, expect, test } from "bun:test"
import { deploymentDraftKey, deploymentSelections } from "./deploy-draft"
import { deploymentWorkflowFixtures } from "../fixtures/github"

describe("deployment draft", () => {
  test("compares workflows and inputs independently of their order", () => {
    expect(
      deploymentDraftKey({
        ref: " master ",
        workflows: [
          { filename: "app-shop.yml", inputs: { perform_tests: true, force_rebuild: false } },
          { filename: "app-admin.yml", inputs: { perform_tests: false } },
        ],
      }),
    ).toBe(
      deploymentDraftKey({
        ref: "master",
        workflows: [
          { filename: "app-admin.yml", inputs: { perform_tests: false } },
          { filename: "app-shop.yml", inputs: { force_rebuild: false, perform_tests: true } },
        ],
      }),
    )
  })

  test("keeps same-named workflow inputs independent and omits deselected workflows", () => {
    const inputs = {
      "app-shop.yml": { perform_tests: false, force_rebuild: true },
      "app-admin.yml": { perform_tests: true },
    }
    const selections = deploymentSelections(deploymentWorkflowFixtures, ["app-shop.yml", "app-admin.yml"], inputs)
    expect(selections.map((selection) => selection.issues)).toEqual([[], []])
    expect(selections[0].values.perform_tests).toBe(false)
    expect(selections[1].values).toEqual({ perform_tests: true })
    expect(deploymentSelections(deploymentWorkflowFixtures, ["app-admin.yml"], inputs)).toEqual([selections[1]])
  })
})
