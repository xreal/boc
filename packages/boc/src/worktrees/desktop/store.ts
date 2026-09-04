import { Option, Schema } from "effect"
import { WorktreeBackend, type WorktreeProjectScope } from "./rpcs"

export const WORKTREE_PREFERENCES_STORE_NAME = "boc.worktrees"

const StoredWorktreePreferences = Schema.Struct({
  defaultBackend: Schema.optionalKey(WorktreeBackend),
  projects: Schema.optionalKey(Schema.Record(Schema.String, WorktreeBackend)),
})
type StoredWorktreePreferences = typeof StoredWorktreePreferences.Type

const decodePreferences = Schema.decodeUnknownOption(StoredWorktreePreferences)

export type WorktreePreferenceStore = {
  read(): unknown
  write(value: StoredWorktreePreferences): void
}

export function getDefaultBackend(store: WorktreePreferenceStore) {
  return readPreferences(store).defaultBackend
}

export function setDefaultBackend(store: WorktreePreferenceStore, defaultBackend: WorktreeBackend) {
  store.write({ ...readPreferences(store), defaultBackend })
  return defaultBackend
}

export function getProjectBackend(store: WorktreePreferenceStore, scope: WorktreeProjectScope) {
  return readPreferences(store).projects[projectKey(scope)]
}

export function setProjectBackend(
  store: WorktreePreferenceStore,
  scope: WorktreeProjectScope,
  backend: WorktreeBackend | undefined,
) {
  const preferences = readPreferences(store)
  const key = projectKey(scope)
  if (backend) {
    store.write({ ...preferences, projects: { ...preferences.projects, [key]: backend } })
    return backend
  }
  const projects = Object.fromEntries(Object.entries(preferences.projects).filter(([project]) => project !== key))
  store.write({ ...preferences, projects })
  return undefined
}

export function memoryWorktreePreferenceStore(initial?: unknown): WorktreePreferenceStore {
  let value = initial
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
  }
}

function readPreferences(store: WorktreePreferenceStore) {
  const stored = Option.getOrUndefined(decodePreferences(store.read()))
  return {
    defaultBackend: stored?.defaultBackend ?? ("git" as const),
    projects: stored?.projects ?? {},
  }
}

function projectKey(scope: WorktreeProjectScope) {
  return JSON.stringify([scope.server, scope.projectID])
}
