import { createBocTranslator } from "@boc/extensions/renderer"
import { Select } from "@opencode/ui/select"
import { createEffect, createMemo, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { BocEnvironmentProjectSetting } from "@/boc/environments/settings"
import {
  BocRiftCleanupSetting,
  BocWorktreeDefaultSetting,
  BocWorktreeProjectSetting,
} from "@/boc/worktrees/settings"
import { useLanguage } from "@/runtime/i18n/language"
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

export function BocSettings(props: { directory?: string }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const global = useGlobal()
  const [state, setState] = createStore({
    server: undefined as ServerConnection.Key | undefined,
    directory: undefined as string | undefined,
    project: undefined as string | undefined,
  })
  const server = global.settings.server.selected
  const projects = createMemo(() => {
    const selected = server()
    if (!selected) return []
    return global
      .ensureServerCtx(selected)
      .projects.list()
      .filter((project) => project.id && project.id !== "global")
  })
  const project = createMemo(() => projects().find((item) => pathKey(item.worktree) === state.project))
  const selection = createMemo(() => {
    const selectedServer = server()
    const selectedProject = project()
    if (!selectedServer || !selectedProject) return
    return { server: selectedServer, project: selectedProject }
  })

  createEffect(() => {
    const selected = server()
    const serverKey = selected ? ServerConnection.key(selected) : undefined
    if (state.server === serverKey && state.directory === props.directory) return
    const directory = props.directory
    const contextual = directory ? projects().find((project) => sameDirectory(project.worktree, directory)) : undefined
    setState({ server: serverKey, directory: props.directory, project: contextual ? pathKey(contextual.worktree) : undefined })
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
          <InlineServerSelect onServerSelect={() => setState("project", undefined)} />
        </div>
      </div>

      <div class="settings-tab-body flex flex-col gap-8">
        <div class="settings-section">
          <h3 class="settings-section-title">{t("boc.settings.checkoutDefaults")}</h3>
          <SettingsList>
            <BocWorktreeDefaultSetting />
          </SettingsList>
        </div>

        <div class="settings-section">
          <h3 class="settings-section-title">{t("boc.settings.storage")}</h3>
          <SettingsList>
            <BocRiftCleanupSetting />
          </SettingsList>
        </div>

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
                disabled={!server() || projects().length === 0}
                onSelect={(item) => setState("project", item ? pathKey(item.worktree) : undefined)}
              />
            </SettingsRow>
          </SettingsList>

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
                  <div class="flex flex-col gap-5 pt-5">
                    <BocWorktreeProjectSetting project={selected.project} server={selected.server} />
                    <BocEnvironmentProjectSetting project={selected.project} server={selected.server} />
                  </div>
                </LocationProvider>
              </SettingsServerDataScope>
            )}
          </Show>
        </div>
      </div>
    </>
  )
}
