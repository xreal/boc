import { Option, Schema } from "effect"
import type { SecretVault } from "../../jira/main/credentials"
import { DeploymentSettings } from "../rpcs"

const StoredSettings = Schema.Struct({
  ...DeploymentSettings.fields,
  sitePasswordCiphertext: Schema.optionalKey(Schema.String),
})

export function sealDeploymentSettings(settings: DeploymentSettings, vault: SecretVault) {
  const { sitePassword, ...publicSettings } = settings
  if (!sitePassword) return publicSettings
  if (!vault.isEncryptionAvailable()) return
  return {
    ...publicSettings,
    sitePasswordCiphertext: vault.encryptString(sitePassword).toString("base64"),
  }
}

export function openDeploymentSettings(value: unknown, vault: SecretVault) {
  const settings = Option.getOrUndefined(Schema.decodeUnknownOption(StoredSettings)(value))
  if (!settings) return
  const { sitePassword, sitePasswordCiphertext, ...publicSettings } = settings
  const password =
    sitePasswordCiphertext && vault.isEncryptionAvailable()
      ? vault.decryptString(Buffer.from(sitePasswordCiphertext, "base64"))
      : undefined
  return { ...publicSettings, ...(password ? { sitePassword: password } : {}) }
}
