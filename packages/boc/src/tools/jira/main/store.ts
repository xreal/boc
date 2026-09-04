import { Option, Schema } from "effect"

export const JIRA_STORE_NAME = "boc.jira"

export const JiraStoredConnection = Schema.Struct({
  site: Schema.String,
  email: Schema.String,
  displayName: Schema.String,
  tokenCiphertext: Schema.String,
})
export type JiraStoredConnection = typeof JiraStoredConnection.Type

const decodeStoredConnection = Schema.decodeUnknownOption(JiraStoredConnection)

export type JiraStore = {
  read(): unknown
  write(value: JiraStoredConnection): void
  clear(): void
}

export function readStoredConnection(store: JiraStore) {
  return Option.getOrUndefined(decodeStoredConnection(store.read()))
}

export function memoryJiraStore(initial?: JiraStoredConnection): JiraStore {
  let value: JiraStoredConnection | undefined = initial
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    clear: () => {
      value = undefined
    },
  }
}
