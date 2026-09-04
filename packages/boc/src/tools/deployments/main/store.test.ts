import { describe, expect, test } from "bun:test"
import {
  DEFAULT_DEPLOYMENT_SETTINGS,
  memoryDeploymentStore,
  normalizeDeploymentSettings,
  readDeploymentOperations,
  readDeploymentSettings,
} from "./store"

describe("deployment settings store", () => {
  test("uses safe defaults for missing or corrupt state", () => {
    expect(readDeploymentSettings(memoryDeploymentStore())).toEqual(DEFAULT_DEPLOYMENT_SETTINGS)
    expect(readDeploymentSettings(memoryDeploymentStore({ applicationLabelKey: 42, githubToken: "secret" }))).toEqual(
      DEFAULT_DEPLOYMENT_SETTINGS,
    )
  })

  test("normalizes optional values and never defines a secret field", () => {
    expect(
      normalizeDeploymentSettings({
        devenvPath: "/work/devenv/",
        argoProject: "  shop-dev  ",
        applicationLabelKey: " app ",
        applicationLabelValue: " shop ",
        notificationsEnabled: false,
      }),
    ).toEqual({
      devenvPath: "/work/devenv/",
      argoProject: "shop-dev",
      applicationLabelKey: "app",
      applicationLabelValue: "shop",
      notificationsEnabled: false,
    })
    expect(JSON.stringify(DEFAULT_DEPLOYMENT_SETTINGS)).not.toMatch(/token|secret|authorization/i)
  })

  test("drops corrupt operations and never stores credentials", () => {
    expect(readDeploymentOperations(memoryDeploymentStore(undefined, { token: "secret" }))).toEqual([])
    expect(JSON.stringify(memoryDeploymentStore())).not.toMatch(/token|secret|authorization/i)
  })
})
