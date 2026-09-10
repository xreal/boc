import { createBocTranslator } from "@boc/extensions/renderer"
import { Select } from "@opencode/ui/select"
import { Schema } from "effect"
import { createMemo, Show } from "solid-js"
import { BocEnvironmentProjectSetting } from "@/boc/environments/settings"
import { useLanguage } from "@/runtime/i18n/language"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { InlineServerSelect } from "@/settings/server-select"
import { SettingsServerDataScope } from "@/settings/server-scope"
import { displayName } from "@/shell/layout/helpers"
import { pathKey } from "@/workspaces/path-key"
import { sameDirectory } from "@/workspaces/paths"
import { LocationProvider } from "@/workspaces/location"

const preferences = Persistence.struct({
  projects: Persistence.record(Schema.String),
})

export function BocSettings(props: { directory?: string }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const global = useGlobal()
  const [saved, setSaved, , ready] = persisted(Persist.window("boc.settings"), preferences, { projects: {} })
  const server = global.settings.server.selected
  const projects = createMemo(() => {
    const selected = server()
    if (!selected) return []
    return global
      .ensureServerCtx(selected)
      .projects.list()
      .filter((project) => project.id && project.id !== "global")
  })
  const project = createMemo(() => {
    const selected = server()
    if (!selected || !ready()) return
    const remembered = saved.projects[ServerConnection.key(selected)]
    const directory = props.directory
    return (
      projects().find((item) => pathKey(item.worktree) === remembered) ??
      (directory ? projects().find((item) => sameDirectory(item.worktree, directory)) : undefined)
    )
  })
  const selection = createMemo(() => {
    const selectedServer = server()
    const selectedProject = project()
    if (!selectedServer || !selectedProject) return
    return { server: selectedServer, project: selectedProject }
  })

  return (
    <>
      <div class="settings-tab-header">
        <div class="settings-tab-header-row">
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="settings-tab-title">{t("boc.settings.title")}</h2>
            <span class="text-11-regular leading-text-compact text-v2-text-text-muted">
              {t("boc.settings.description")}
            </span>
          </div>
          <InlineServerSelect />
        </div>
      </div>

      <div class="settings-tab-body">
        <div class="settings-section">
          <h3 class="settings-section-title">{t("boc.settings.project")}</h3>
          <SettingsList>
            <SettingsRow title={t("boc.settings.project")} description={t("boc.settings.project.description")}>
              <Select
                class="w-full sm:w-[300px]"
                options={projects()}
                current={project()}
                value={(item) => pathKey(item.worktree)}
                label={displayName}
                placeholder={t("boc.settings.project.select")}
                disabled={!ready() || !server() || projects().length === 0}
                onSelect={(item) => {
                  const selected = server()
                  if (!selected || !item) return
                  setSaved("projects", ServerConnection.key(selected), pathKey(item.worktree))
                }}
              />
            </SettingsRow>
          </SettingsList>
        </div>

        <Show
          when={selection()}
          keyed
          fallback={
            <p class="m-0 pt-4 text-12-regular leading-text-base text-v2-text-text-muted">
              {t("boc.settings.project.empty")}
            </p>
          }
        >
          {(selected) => (
            <SettingsServerDataScope server={selected.server} directory={selected.project.worktree}>
              <LocationProvider directory={selected.project.worktree}>
                <BocEnvironmentProjectSetting project={selected.project} server={selected.server} />
              </LocationProvider>
            </SettingsServerDataScope>
          )}
        </Show>
      </div>
    </>
  )
}
