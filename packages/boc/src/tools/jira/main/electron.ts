import Store from "electron-store"
import { app, safeStorage } from "electron"
import { createJiraHandlers, type JiraRuntime } from "./handlers"
import { JIRA_STORE_NAME } from "./store"

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
