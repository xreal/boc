import { expect, test } from "bun:test"
import { memoryVault } from "../../jira/main/credentials"
import { openDeploymentSettings, sealDeploymentSettings } from "./site-credentials"
import { DEFAULT_DEPLOYMENT_SETTINGS, normalizeDeploymentSettings } from "./store"

test("persists only encrypted passwords and restores the exact value", () => {
  const settings = { ...DEFAULT_DEPLOYMENT_SETTINGS, siteUsername: "demo", sitePassword: " p@ss:/?# " }
  const stored = sealDeploymentSettings(settings, memoryVault())
  expect(stored).not.toHaveProperty("sitePassword")
  expect(JSON.stringify(stored)).not.toContain(settings.sitePassword)
  expect(openDeploymentSettings(stored, memoryVault())).toEqual(settings)
  expect(normalizeDeploymentSettings(settings).sitePassword).toBe(settings.sitePassword)
})

test("blank fields clear credentials and work without encrypted storage", () => {
  const settings = normalizeDeploymentSettings({ ...DEFAULT_DEPLOYMENT_SETTINGS, siteUsername: "", sitePassword: "" })
  const stored = sealDeploymentSettings(settings, memoryVault(false))
  expect(stored).toEqual(DEFAULT_DEPLOYMENT_SETTINGS)
  expect(openDeploymentSettings(stored, memoryVault(false))).toEqual(DEFAULT_DEPLOYMENT_SETTINGS)
})

test("does not save a password when encrypted storage is unavailable", () => {
  expect(
    sealDeploymentSettings({ ...DEFAULT_DEPLOYMENT_SETTINGS, sitePassword: "secret" }, memoryVault(false)),
  ).toBeUndefined()
})

test("ignores plaintext passwords and tolerates inaccessible ciphertext", () => {
  expect(openDeploymentSettings({ ...DEFAULT_DEPLOYMENT_SETTINGS, sitePassword: "secret" }, memoryVault())).toEqual(
    DEFAULT_DEPLOYMENT_SETTINGS,
  )
  const stored = sealDeploymentSettings({ ...DEFAULT_DEPLOYMENT_SETTINGS, sitePassword: "secret" }, memoryVault())
  expect(openDeploymentSettings(stored, memoryVault(false))).toEqual(DEFAULT_DEPLOYMENT_SETTINGS)
})
