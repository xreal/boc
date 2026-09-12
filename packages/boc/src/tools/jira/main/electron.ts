import Store from "electron-store"
import { app, dialog, safeStorage } from "electron"
import path from "node:path"
import { saveJiraAttachment } from "./attachment-download"
import { createJiraHandlers, type JiraRuntime } from "./handlers"
import { JIRA_STORE_NAME } from "./store"
import { createDeploymentCommandRunner } from "../../deployments/main/command-runner"

let file: Store | undefined

function getStore() {
  if (file) return file
  file = new Store({
    name: JIRA_STORE_NAME,
    cwd: app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  return file
}

const electronJiraRuntime: JiraRuntime = {
  async saveAttachment(filename, response) {
    const chosen = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath("downloads"), path.basename(filename.replaceAll("\\", "/"))),
    })
    if (chosen.canceled || !chosen.filePath) {
      await response.body?.cancel()
      return { ok: true, saved: false }
    }
    return saveJiraAttachment(response, chosen.filePath)
  },
  run: createDeploymentCommandRunner(),
  store: {
    readSessionInstructions: () => getStore().get("sessionInstructions"),
    writeSessionInstructions: (value) => getStore().set("sessionInstructions", value),
    readSessions: () => getStore().get("sessions"),
    writeSessions: (value) => getStore().set("sessions", value),
    read: () => getStore().get("connection"),
    write: (value) => getStore().set("connection", value),
    clear: () => {
      getStore().delete("connection")
      getStore().delete("savedBoards")
      getStore().delete("defaultBoardId")
      getStore().delete("projectTargets")
    },
    readPreferences: () => {
      const defaultBoardId = getStore().get("defaultBoardId")
      const projectTargets = getStore().get("projectTargets")
      return {
        savedBoards: getStore().get("savedBoards") ?? [],
        ...(defaultBoardId === undefined ? {} : { defaultBoardId }),
        ...(projectTargets === undefined ? {} : { projectTargets }),
      }
    },
    writePreferences: (value) => {
      getStore().set("savedBoards", value.savedBoards)
      if (value.defaultBoardId === undefined) getStore().delete("defaultBoardId")
      else getStore().set("defaultBoardId", value.defaultBoardId)
      if (value.projectTargets === undefined) getStore().delete("projectTargets")
      else getStore().set("projectTargets", value.projectTargets)
    },
  },
  vault: {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (plain) => safeStorage.encryptString(plain),
    decryptString: (cipher) => {
      if (!safeStorage.isEncryptionAvailable()) return
      try {
        return safeStorage.decryptString(cipher)
      } catch {
        return
      }
    },
  },
  fetch: (input, init) => globalThis.fetch(input, init),
}

export const jiraHandlers = createJiraHandlers(electronJiraRuntime)
