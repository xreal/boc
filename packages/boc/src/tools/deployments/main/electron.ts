import { app, safeStorage } from "electron"
import Store from "electron-store"
import { createDeploymentCommandRunner } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { createDeploymentHandlers } from "./handlers"
import { DEPLOYMENT_STORE_NAME } from "./store"
import { createCacheRunner } from "./cache-runner"
import { notifyDeploymentFinished } from "./notification"
import { findInstalledDevenvRoot } from "./readiness"
import { openDeploymentSettings, sealDeploymentSettings } from "./site-credentials"

let file: Store | undefined

function getStore() {
  if (file) return file
  file = new Store({
    name: DEPLOYMENT_STORE_NAME,
    cwd: app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  return file
}

const service = createDeploymentService({
  store: {
    readSettings: () =>
      openDeploymentSettings(getStore().get("settings"), {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (plain) => safeStorage.encryptString(plain),
        decryptString: (cipher) => {
          try {
            return safeStorage.decryptString(cipher)
          } catch {
            return undefined
          }
        },
      }),
    writeSettings: (settings) => {
      const stored = sealDeploymentSettings(settings, safeStorage)
      if (!stored) return false
      getStore().set("settings", stored)
    },
    readOperations: () => getStore().get("operations"),
    writeOperations: (operations) => getStore().set("operations", operations),
  },
  // Desktop initialization imports the login-shell environment into process.env before IPC starts.
  run: createDeploymentCommandRunner(() => process.env),
  platform: process.platform,
  findDevenvRoot: findInstalledDevenvRoot,
  runCache: createCacheRunner(),
  notifyFinished: notifyDeploymentFinished,
})

void app.whenReady().then(() => service.startTracking())
app.on("before-quit", () => service.stopTracking())

export const deploymentHandlers = createDeploymentHandlers({ service })
