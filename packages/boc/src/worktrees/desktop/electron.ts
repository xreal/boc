import { app } from "electron"
import Store from "electron-store"
import { createWorktreePreferenceHandlers } from "./handlers"
import { WORKTREE_PREFERENCES_STORE_NAME } from "./store"

let file: Store | undefined

function getStore() {
  if (file) return file
  file = new Store({
    name: WORKTREE_PREFERENCES_STORE_NAME,
    cwd: app.getPath("userData"),
    fileExtension: "",
    accessPropertiesByDotNotation: false,
  })
  return file
}

export const worktreePreferenceHandlers = createWorktreePreferenceHandlers({
  read: () => getStore().get("preferences"),
  write: (value) => getStore().set("preferences", value),
})
