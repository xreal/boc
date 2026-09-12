import { describe, expect, test } from "bun:test"
import { createBocTranslator } from "../../../renderer/i18n"
import { deploymentFailure } from "../domain/failures"
import { workflowDiscoveryFailureMessage } from "./deployment-failure"

const t = createBocTranslator(() => "en")

describe("workflow discovery failure", () => {
  test("explains the failed GitHub boundary", () => {
    expect(workflowDiscoveryFailureMessage(t, deploymentFailure("permission"))).toBe(
      "GitHub denied access to workflow definitions.",
    )
    expect(workflowDiscoveryFailureMessage(t, deploymentFailure("rate-limit"))).toBe(
      "GitHub is rate limiting workflow checks. Try again later.",
    )
    expect(workflowDiscoveryFailureMessage(t, deploymentFailure("malformed"))).toBe(
      "A workflow definition on this branch could not be read.",
    )
    expect(workflowDiscoveryFailureMessage(t, deploymentFailure("unknown"))).toBe(
      "GitHub could not load workflows for this branch.",
    )
  })
})
