import { createBocTranslator } from "@boc/extensions/renderer"
import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { validEnvironmentDomain } from "./model"
import { useEnvironmentProjectSettings } from "./settings-store"

export function BocEnvironmentProjectSetting(props: { project: LocalProject; server: ServerConnection.Any }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const sdk = useServerSDK()
  const settings = useEnvironmentProjectSettings({
    scope: sdk.scope,
    projectDirectory: props.project.worktree,
    platform,
  })
  const [draft, setDraft] = createStore({ enabled: false, domain: "", loaded: false, saved: false })

  createEffect(() => {
    if (!settings.ready() || draft.loaded) return
    setDraft({
      enabled: settings.settings.enabled,
      domain: settings.settings.domain,
      loaded: true,
      saved: false,
    })
  })

  const valid = () => validEnvironmentDomain(draft.domain)
  const changed = () => draft.enabled !== settings.settings.enabled || draft.domain.trim() !== settings.settings.domain
  const save = () => {
    if (!valid()) return
    settings.update({ enabled: draft.enabled, domain: draft.domain.trim() })
    setDraft("domain", draft.domain.trim())
    setDraft("saved", true)
  }
  const toggleEnabled = (enabled: boolean) => {
    setDraft({ enabled, saved: false })
    if (!valid()) return
    settings.update({ enabled, domain: draft.domain.trim() })
    setDraft({ domain: draft.domain.trim(), saved: true })
  }
  const supported = () => ServerConnection.local(props.server) && platform.os !== "windows"

  return (
    <Show when={props.project.id && props.project.id !== "global" && supported()}>
      <section class="settings-section">
        <h3 class="settings-section-title flex flex-wrap items-center gap-2">
          {t("boc.environments.settings.title")}
          <Badge>{t("boc.environments.settings.experimental")}</Badge>
        </h3>

        <SettingsList>
          <SettingsRow
            title={t("boc.environments.settings.enabled")}
            description={t("boc.environments.settings.enabled.description")}
          >
            <Switch
              checked={draft.enabled}
              disabled={!draft.loaded}
              hideLabel
              onChange={toggleEnabled}
            >
              {t("boc.environments.settings.enabled")}
            </Switch>
          </SettingsRow>

          <SettingsRow
            title={<label for="boc-environment-domain">{t("boc.environments.settings.domain")}</label>}
            description={t("boc.environments.settings.domain.description")}
          >
            <div class="flex w-full flex-col gap-2 sm:w-56">
              <TextInput
                id="boc-environment-domain"
                dir="ltr"
                class="!w-full"
                value={draft.domain}
                disabled={!draft.loaded || !draft.enabled}
                invalid={!valid()}
                aria-invalid={!valid()}
                aria-describedby={!valid() ? "boc-environment-domain-help" : undefined}
                placeholder={t("boc.environments.settings.domain.placeholder")}
                spellcheck={false}
                onInput={(event) => setDraft({ domain: event.currentTarget.value, saved: false })}
              />
              <Show when={!valid()}>
                <div
                  id="boc-environment-domain-help"
                  class="text-11-regular leading-text-compact text-v2-state-fg-danger"
                  role="alert"
                >
                  {t("boc.environments.settings.domain.invalid")}
                </div>
              </Show>
            </div>
          </SettingsRow>
        </SettingsList>

        <details class="text-12-regular leading-text-base text-v2-text-text-muted">
          <summary class="cursor-pointer hover:text-v2-text-text-base">
            {t("boc.environments.settings.shared.title")}
          </summary>
          <p class="m-0 pt-2">{t("boc.environments.settings.shared.description")}</p>
        </details>

        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="text-11-regular leading-text-compact text-v2-text-text-muted" role="status" aria-live="polite">
            {draft.saved ? t("boc.environments.settings.saved") : ""}
          </span>
          <Button type="button" variant="neutral" disabled={!draft.loaded || !valid() || !changed()} onClick={save}>
            {t("boc.environments.settings.save")}
          </Button>
        </div>
      </section>
    </Show>
  )
}
