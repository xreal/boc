import { Persist, persisted } from "@/runtime/persistence/storage"
import type { Platform } from "@/runtime/platform/platform"
import type { ServerScope } from "@/runtime/server/scope"
import { pathKey } from "@/workspaces/path-key"
import { Schema } from "effect"
import { createRoot, onCleanup } from "solid-js"

const EnvironmentProjectSettings = Schema.Struct({
  enabled: Schema.Boolean,
  domain: Schema.String,
})

export type EnvironmentProjectSettings = typeof EnvironmentProjectSettings.Type
type SettingsEntry = ReturnType<typeof createSettingsEntry>

const entries = new Map<string, SettingsEntry>()

function createSettingsEntry(input: { scope: ServerScope; projectDirectory: string; platform: Platform }) {
  return createRoot((dispose) => {
    const [settings, setSettings, , ready] = persisted(
      Persist.serverWorkspace(input.scope, input.projectDirectory, "boc.environment"),
      EnvironmentProjectSettings,
      { enabled: false, domain: "" },
      input.platform,
    )
    return {
      settings,
      ready,
      dispose,
      references: 0,
      update(value: EnvironmentProjectSettings) {
        setSettings(value)
      },
    }
  })
}

export function useEnvironmentProjectSettings(input: {
  scope: ServerScope
  projectDirectory: string
  platform: Platform
}) {
  const key = `${input.scope}\0${pathKey(input.projectDirectory)}`
  const entry = entries.get(key) ?? createSettingsEntry(input)
  entries.set(key, entry)
  entry.references += 1
  onCleanup(() => {
    entry.references -= 1
    if (entry.references > 0) return
    entry.dispose()
    entries.delete(key)
  })
  return entry
}
