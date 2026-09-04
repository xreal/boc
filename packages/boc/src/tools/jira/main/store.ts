import { Option, Schema } from "effect"
import { JiraPreferences, normalizeSavedBoards } from "../domain/board"

export const JIRA_STORE_NAME = "boc.jira"

export const JiraStoredConnection = Schema.Struct({
  site: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
  tokenCiphertext: Schema.String,
})
export type JiraStoredConnection = typeof JiraStoredConnection.Type

const decodeStoredConnection = Schema.decodeUnknownOption(JiraStoredConnection)
const decodePreferences = Schema.decodeUnknownOption(JiraPreferences)

export type JiraStore = {
  read(): unknown
  write(value: JiraStoredConnection): void
  clear(): void
  readPreferences(): unknown
  writePreferences(value: JiraPreferences): void
}

export function readStoredConnection(store: JiraStore) {
  return Option.getOrUndefined(decodeStoredConnection(store.read()))
}

export function readStoredPreferences(store: JiraStore): JiraPreferences {
  const stored = Option.getOrUndefined(decodePreferences(store.readPreferences()))
  return normalizeSavedBoards(stored?.savedBoards ?? [], stored?.defaultBoardId)
}

export function memoryJiraStore(initial?: JiraStoredConnection, preferences?: JiraPreferences): JiraStore {
  let connection: JiraStoredConnection | undefined = initial
  let storedPreferences: JiraPreferences = preferences ?? { savedBoards: [] }
  return {
    read: () => connection,
    write: (next) => {
      connection = next
    },
    clear: () => {
      connection = undefined
      storedPreferences = { savedBoards: [] }
    },
    readPreferences: () => storedPreferences,
    writePreferences: (next) => {
      storedPreferences = next
    },
  }
}
