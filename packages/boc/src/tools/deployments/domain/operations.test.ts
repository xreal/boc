import { describe, expect, test } from "bun:test"
import {
  aggregateDeploymentOperation,
  isBlockingDeploymentOperation,
  isTerminalDeploymentOperation,
  pruneDeploymentHistory,
  type DeploymentOperationSummary,
} from "./operations"

const operation = (id: string, state: DeploymentOperationSummary["state"], updatedAt: string) =>
  ({
    id,
    environment: "02",
    branch: "SHOP-321-checkout",
    workflows: [{ filename: "app-shop.yml", state }],
    state,
    createdAt: updatedAt,
    updatedAt,
  }) satisfies DeploymentOperationSummary

describe("deployment operations", () => {
  test("aggregates conservatively and succeeds only when every workflow succeeds", () => {
    expect(aggregateDeploymentOperation([])).toBe("unknown")
    expect(aggregateDeploymentOperation(["success", "success"])).toBe("success")
    expect(aggregateDeploymentOperation(["success", "queued"])).toBe("queued")
    expect(aggregateDeploymentOperation(["success", "in-progress"])).toBe("in-progress")
    expect(aggregateDeploymentOperation(["failure", "in-progress", "timed-out"])).toBe("failure")
    expect(aggregateDeploymentOperation(["timed-out", "queued"])).toBe("timed-out")
    expect(aggregateDeploymentOperation(["unknown", "in-progress"])).toBe("unknown")
  })

  test("keeps active and unknown operations while pruning old terminal history", () => {
    const now = Date.parse("2026-09-04T12:00:00.000Z")
    const operations = [
      operation("recent", "success", "2026-09-04T11:00:00.000Z"),
      operation("old", "failure", "2026-09-03T11:59:59.000Z"),
      operation("active-old", "in-progress", "2026-08-31T12:00:00.000Z"),
      operation("unknown-old", "unknown", "2026-08-31T12:00:00.000Z"),
      operation("malformed", "cancelled", "not-a-date"),
    ]

    expect(pruneDeploymentHistory(operations, now).map((item) => item.id)).toEqual([
      "recent",
      "active-old",
      "unknown-old",
    ])
    expect(isTerminalDeploymentOperation("success")).toBe(true)
    expect(isTerminalDeploymentOperation("unknown")).toBe(false)
    expect(isBlockingDeploymentOperation("dispatching")).toBe(true)
    expect(isBlockingDeploymentOperation("prepared")).toBe(false)
    expect(isBlockingDeploymentOperation("success")).toBe(false)
  })
})
