import { Effect } from "effect"
import { WorktreePreferenceRpcs } from "./rpcs"
import {
  getDefaultBackend,
  getProjectBackend,
  setDefaultBackend,
  setProjectBackend,
  type WorktreePreferenceStore,
} from "./store"

export function createWorktreePreferenceHandlers(store: WorktreePreferenceStore) {
  return WorktreePreferenceRpcs.toLayer(
    WorktreePreferenceRpcs.of({
      BocWorktreesGetDefault: () => Effect.sync(() => ({ defaultBackend: getDefaultBackend(store) })),
      BocWorktreesSetDefault: (payload) =>
        Effect.sync(() => ({ defaultBackend: setDefaultBackend(store, payload.defaultBackend) })),
      BocWorktreesGetProject: (payload) => Effect.sync(() => projectPreference(getProjectBackend(store, payload))),
      BocWorktreesSetProject: (payload) =>
        Effect.sync(() => projectPreference(setProjectBackend(store, payload, payload.backend))),
    }),
  )
}

function projectPreference(backend: "git" | "rift" | undefined) {
  return backend ? { backend } : {}
}
