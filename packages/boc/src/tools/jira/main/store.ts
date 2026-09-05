import { Option, Schema } from "effect"
import { JiraSessionLink, JiraSessionInstructions, defaultJiraSessionInstructions } from "../domain/sessions"
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
const decodeSessionInstructions = Schema.decodeUnknownOption(JiraSessionInstructions)
const decodeSessionLinks = Schema.decodeUnknownOption(Schema.Array(JiraSessionLink))

export type JiraStore = {
  readSessionInstructions(): unknown
  writeSessionInstructions(value: JiraSessionInstructions): void
  readSessions(): unknown
  writeSessions(value: readonly JiraSessionLink[]): void
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
  let instructions: JiraSessionInstructions | undefined
  let sessions: readonly JiraSessionLink[] = []
  return {
    readSessionInstructions: () => instructions,
    writeSessionInstructions: (value) => {
      instructions = value
    },
    readSessions: () => sessions,
    writeSessions: (value) => {
      sessions = value
    },
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

export function readSessionInstructions(store: JiraStore): JiraSessionInstructions {
  return Option.getOrElse(
    decodeSessionInstructions(store.readSessionInstructions()),
    () => defaultJiraSessionInstructions,
  )
}

export function readSessionLinks(store: JiraStore): readonly JiraSessionLink[] {
  return Option.getOrElse(decodeSessionLinks(store.readSessions()), () => [])
}

export function saveSessionLink(store: JiraStore, link: JiraSessionLink) {
  const links = readSessionLinks(store)
  if (links.some((item) => item.draftID === link.draftID)) return
  store.writeSessions([...links, link])
}

export function promoteSessionLink(store: JiraStore, input: { draftID: string; server: string; sessionID: string }) {
  const links = readSessionLinks(store)
  if (!links.some((link) => link.draftID === input.draftID && !link.sessionID)) return
  store.writeSessions(
    links.map((link) =>
      link.draftID === input.draftID ? { ...link, server: input.server, sessionID: input.sessionID } : link,
    ),
  )
}
