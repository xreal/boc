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
    read: () => getStore().get("connection"),
    write: (value) => getStore().set("connection", value),
    clear: () => getStore().delete("connection"),
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
