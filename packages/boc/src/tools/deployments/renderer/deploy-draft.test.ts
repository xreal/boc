import { describe, expect, test } from "bun:test"
import { deploySubmitDisabledReason, deploymentDraftKey, preparedPlanKey } from "./deploy-draft"
import type { DeploymentPreparedPlan } from "../rpcs"

const plan: DeploymentPreparedPlan = {
  preflightId: "plan-1",
  expiresAt: "2026-09-04T12:05:00.000Z",
  kind: "deploy",
  environment: "02",
  ref: "SHOP-42",
  workflows: [{ filename: "app-shop.yml", name: "Shop", inputs: { perform_tests: true } }],
  warnings: [],
}

describe("deployment draft confirmation", () => {
  test("invalidates the prepared plan when the draft changes", () => {
    const draft = deploymentDraftKey({
      ref: "SHOP-42",
      filenames: ["app-shop.yml"],
      inputs: { perform_tests: true },
    })
    expect(preparedPlanKey(plan)).toBe(draft)
    expect(
      deploymentDraftKey({
        ref: "SHOP-42",
        filenames: ["app-shop.yml"],
        inputs: { perform_tests: false },
      }),
    ).not.toBe(draft)
  })

  test("exposes an explicit reason instead of a confirmation checkbox", () => {
    const draftKey = preparedPlanKey(plan)
    expect(
      deploySubmitDisabledReason({
        dispatching: false,
        preparing: false,
        ref: "SHOP-42",
        filenames: ["app-shop.yml"],
        draftKey,
        plan,
        now: Date.parse("2026-09-04T12:00:00.000Z"),
      }),
    ).toBeUndefined()
    expect(
      deploySubmitDisabledReason({
        dispatching: true,
        preparing: false,
        ref: "SHOP-42",
        filenames: ["app-shop.yml"],
        draftKey,
        plan,
      }),
    ).toBe("dispatching")
    expect(
      deploySubmitDisabledReason({
        dispatching: false,
        preparing: true,
        ref: "SHOP-42",
        filenames: ["app-shop.yml"],
        draftKey,
        plan,
      }),
    ).toBe("reviewing")
    expect(
      deploySubmitDisabledReason({
        dispatching: false,
        preparing: false,
        ref: "SHOP-42",
        filenames: ["app-shop.yml"],
        draftKey,
        plan,
        now: Date.parse("2026-09-04T12:05:00.000Z"),
      }),
    ).toBe("expired")
  })
})
