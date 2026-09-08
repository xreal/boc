import { createBocTranslator } from "@boc/extensions/renderer"
import { Badge } from "@opencode-ai/ui/badge"
import { Button } from "@opencode-ai/ui/button"
import { Field } from "@opencode-ai/ui/field"
import { Icon } from "@opencode-ai/ui/icon"
import { Switch } from "@opencode-ai/ui/switch"
import { TextInput } from "@opencode-ai/ui/text-input"
import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
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
      <section class="mt-5 flex w-full flex-col gap-4 border-t border-v2-border-border-base pt-5">
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2 text-13-medium leading-text-compact text-v2-text-text-base">
            {t("boc.environments.settings.title")}
            <Badge>{t("boc.environments.settings.experimental")}</Badge>
          </div>
          <p class="m-0 max-w-[620px] text-12-regular leading-text-base text-v2-text-text-muted">
            {t("boc.environments.settings.description")}
          </p>
        </div>

        <Switch
          checked={draft.enabled}
          disabled={!draft.loaded}
          description={t("boc.environments.settings.enabled.description")}
          onChange={toggleEnabled}
        >
          {t("boc.environments.settings.enabled")}
        </Switch>

        <Field>
          <Field.Label>{t("boc.environments.settings.domain")}</Field.Label>
          <Field.Prefix>{t("boc.environments.settings.domain.description")}</Field.Prefix>
          <TextInput
            appearance="large"
            class="!w-full"
            value={draft.domain}
            disabled={!draft.loaded || !draft.enabled}
            invalid={!valid()}
            aria-invalid={!valid()}
            aria-describedby="boc-environment-domain-help"
            placeholder={t("boc.environments.settings.domain.placeholder")}
            spellcheck={false}
            onInput={(event) => setDraft({ domain: event.currentTarget.value, saved: false })}
          />
          <div
            id="boc-environment-domain-help"
            class="min-h-4 text-11-regular leading-text-compact text-v2-state-fg-danger"
            role={!valid() ? "alert" : undefined}
          >
            {valid() ? "" : t("boc.environments.settings.domain.invalid")}
          </div>
        </Field>

        <div class="flex items-start gap-2 rounded-md bg-v2-background-bg-base px-3 py-2">
          <Icon name="info" size="small" class="mt-0.5 shrink-0 text-v2-icon-icon-muted" />
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-12-medium leading-text-compact text-v2-text-text-base">
              {t("boc.environments.settings.shared.title")}
            </span>
            <span class="text-12-regular leading-text-base text-v2-text-text-muted">
              {t("boc.environments.settings.shared.description")}
            </span>
          </div>
        </div>

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
