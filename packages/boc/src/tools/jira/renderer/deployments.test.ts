import { describe, expect, test } from "bun:test"
import { createBocTranslator } from "../../../renderer/i18n"
import type { DeploymentSystem } from "../../deployments/domain/systems"
import { deploymentAgeDisplay } from "./deployments"
import { healthTone, syncTone } from "../../deployments/renderer/system-status"

const t = createBocTranslator(() => "en")

const testSystem: DeploymentSystem = {
  environment: "05",
  name: "dev-05",
  app: "shop",
  branch: "PC-240-remove-outdated-servicemail-stuff",
  ticketKey: "PC-240",
  sync: "synced",
  health: "healthy",
  autoSync: "on",
  availability: "occupied",
  ageSeconds: 25200, // 7h
  deployedAt: "2026-09-07T00:00:00.000Z",
}

describe("Jira deployment display logic", () => {
  test("maps sync tones correctly", () => {
    expect(syncTone("synced")).toBe("success")
    expect(syncTone("out-of-sync")).toBe("warning")
    expect(syncTone("unknown")).toBe("muted")
  })

  test("maps health tones correctly", () => {
    expect(healthTone("healthy")).toBe("success")
    expect(healthTone("progressing")).toBe("warning")
    expect(healthTone("suspended")).toBe("warning")
    expect(healthTone("degraded")).toBe("danger")
    expect(healthTone("missing")).toBe("danger")
    expect(healthTone("unknown")).toBe("muted")
  })

  test("formats deployment age using ageSeconds and dictionary key", () => {
    expect(deploymentAgeDisplay(testSystem, "en", t)).toBe("7h ago")
    expect(deploymentAgeDisplay({ ...testSystem, ageSeconds: 120 }, "en", t)).toBe("2m ago")
    expect(deploymentAgeDisplay({ ...testSystem, ageSeconds: 86400 * 2 }, "en", t)).toBe("2d ago")
  })

  test("translates deployment strings in English dictionary", () => {
    expect(t("boc.jira.board.card.deployed", { hosts: "dev-05" })).toBe("Deployed: dev-05")
    expect(t("boc.jira.board.card.deployed", { hosts: "dev-05, dev-08" })).toBe("Deployed: dev-05, dev-08")
    expect(t("boc.jira.board.deployments.title")).toBe("Deployments")
    expect(t("boc.jira.board.deployments.deploy")).toBe("Deploy")
    expect(t("boc.jira.board.deployments.empty")).toBe("No active deployments for this ticket.")
  })
})
