import { app } from "electron"
import Store from "electron-store"
import { createDeploymentCommandRunner } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { createDeploymentHandlers } from "./handlers"
import { DEPLOYMENT_STORE_NAME } from "./store"
import { createCacheRunner } from "./cache-runner"

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
    readSettings: () => getStore().get("settings"),
    writeSettings: (settings) => getStore().set("settings", settings),
    readOperations: () => getStore().get("operations"),
    writeOperations: (operations) => getStore().set("operations", operations),
  },
  // Desktop initialization imports the login-shell environment into process.env before IPC starts.
  run: createDeploymentCommandRunner(() => process.env),
  platform: process.platform,
  runCache: createCacheRunner(),
})

export const deploymentHandlers = createDeploymentHandlers({ service })
