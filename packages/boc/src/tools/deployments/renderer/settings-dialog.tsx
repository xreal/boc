import { Button } from "@opencode/ui/button"
import { Collapsible } from "@opencode/ui/collapsible"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from "@opencode/ui/dialog"
import { Field } from "@opencode/ui/field"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { TextInput } from "@opencode/ui/text-input"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createBocTranslator } from "../../../renderer/i18n"
import type { DeploymentFailure, DeploymentReadiness, DeploymentSettings } from "../rpcs"
import { DeploymentInfo } from "./info-tooltip"
import { DeploymentReadinessSummary } from "./readiness-panel"

export function DeploymentSettingsDialog(props: {
  api: Pick<BocDesktopAPI["deployments"], "saveSettings" | "checkReadiness">
  locale: () => string
  settings: DeploymentSettings
  readiness: DeploymentReadiness
  onSaved: (settings: DeploymentSettings, readiness: DeploymentReadiness) => void
}) {
  const t = createBocTranslator(props.locale)
  const [form, setForm] = createStore({
    devenvPath: props.settings.devenvPath ?? "",
    argoProject: props.settings.argoProject ?? "",
    applicationLabelKey: props.settings.applicationLabelKey,
    applicationLabelValue: props.settings.applicationLabelValue,
    notificationsEnabled: props.settings.notificationsEnabled,
    siteUsername: props.settings.siteUsername ?? "",
    sitePassword: props.settings.sitePassword ?? "",
    readiness: props.readiness,
    busy: false as false | "save" | "retry",
    failure: undefined as DeploymentFailure | undefined,
    saved: false,
    checked: false,
    transportFailure: false,
    savedSettings: props.settings,
  })

  const dirty = () =>
    form.devenvPath !== (form.savedSettings.devenvPath ?? "") ||
    form.argoProject !== (form.savedSettings.argoProject ?? "") ||
    form.applicationLabelKey !== form.savedSettings.applicationLabelKey ||
    form.applicationLabelValue !== form.savedSettings.applicationLabelValue ||
    form.notificationsEnabled !== form.savedSettings.notificationsEnabled ||
    form.siteUsername !== (form.savedSettings.siteUsername ?? "") ||
    form.sitePassword !== (form.savedSettings.sitePassword ?? "")

  const save = async () => {
    if (form.busy) return
    setForm({ busy: "save", failure: undefined, saved: false, checked: false, transportFailure: false })
    const result = await props.api
      .saveSettings({
        ...(form.devenvPath.trim() ? { devenvPath: form.devenvPath } : {}),
        ...(form.argoProject.trim() ? { argoProject: form.argoProject } : {}),
        applicationLabelKey: form.applicationLabelKey,
        applicationLabelValue: form.applicationLabelValue,
        notificationsEnabled: form.notificationsEnabled,
        siteUsername: form.siteUsername,
        sitePassword: form.sitePassword,
      })
      .catch(() => undefined)
    if (!result) {
      setForm({ busy: false, transportFailure: true })
      return
    }
    if (!result.ok) {
      setForm({ busy: false, failure: result })
      return
    }
    setForm({
      busy: false,
      saved: true,
      savedSettings: result.settings,
      failure: undefined,
      readiness: result.readiness,
      devenvPath: result.settings.devenvPath ?? "",
      argoProject: result.settings.argoProject ?? "",
      applicationLabelKey: result.settings.applicationLabelKey,
      applicationLabelValue: result.settings.applicationLabelValue,
      notificationsEnabled: result.settings.notificationsEnabled,
      siteUsername: result.settings.siteUsername ?? "",
      sitePassword: result.settings.sitePassword ?? "",
    })
    props.onSaved(result.settings, result.readiness)
  }

  const retry = async () => {
    if (form.busy || dirty()) return
    setForm({ busy: "retry", failure: undefined, saved: false, checked: false, transportFailure: false })
    const readiness = await props.api.checkReadiness().catch(() => undefined)
    if (!readiness) {
      setForm({ busy: false, transportFailure: true })
      return
    }
    setForm({ busy: false, readiness, checked: true })
    props.onSaved(form.savedSettings, readiness)
  }

  return (
    <Dialog
      fit
      containerClass="!h-auto !max-h-[calc(100vh-2rem)] !w-[min(40rem,calc(100vw-2rem))]"
      data-boc-dialog="deployment-settings"
    >
      <DialogHeader closeLabel={t("boc.deployments.settings.close")}>
        <DialogTitle>{t("boc.deployments.settings.title")}</DialogTitle>
      </DialogHeader>
      <DialogBody class="flex min-w-0 flex-col gap-3 overflow-x-hidden !overflow-y-auto px-4 pb-4">
        <Show when={form.failure}>
          <p role="alert" class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-danger">
            {settingsFailureMessage(t, form.failure!)}
          </p>
        </Show>
        <Show when={form.saved && !dirty()}>
          <p role="status" class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-success">
            {t("boc.deployments.settings.saved")}
          </p>
        </Show>

        <Show when={form.transportFailure}>
          <p role="alert" class="text-[13px] leading-[var(--line-height-base)] text-v2-state-fg-danger">
            {t("boc.deployments.settings.failure.connection")}
          </p>
        </Show>
        <Show when={dirty() || form.checked}>
          <p role="status" class="text-[13px] leading-[var(--line-height-base)]">
            {t(dirty() ? "boc.deployments.settings.unsaved" : "boc.deployments.settings.checked")}
          </p>
        </Show>

        <Field>
          <div class="flex items-center gap-1">
            <Field.Label>{t("boc.deployments.settings.devenv.label")}</Field.Label>
            <DeploymentInfo
              t={t}
              topic={t("boc.deployments.settings.devenv.label")}
              value={t("boc.deployments.settings.devenv.help")}
            />
          </div>
          <TextInput
            class="!w-full"
            name="deployment-devenv-path"
            autocomplete="off"
            spellcheck={false}
            placeholder={t("boc.deployments.settings.devenv.placeholder")}
            value={form.devenvPath}
            disabled={form.busy !== false}
            onInput={(event) => setForm("devenvPath", event.currentTarget.value)}
          />
        </Field>

        <section class="flex flex-col gap-3 rounded-md border border-v2-border-border-muted p-3">
          <h2 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
            {t("boc.deployments.settings.site.title")}
          </h2>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field>
              <Field.Label>{t("boc.deployments.settings.site.username")}</Field.Label>
              <TextInput
                class="!w-full"
                name="deployment-site-username"
                autocomplete="off"
                spellcheck={false}
                value={form.siteUsername}
                disabled={form.busy !== false}
                onInput={(event) => setForm("siteUsername", event.currentTarget.value)}
              />
            </Field>
            <Field>
              <Field.Label>{t("boc.deployments.settings.site.password")}</Field.Label>
              <TextInput
                class="!w-full"
                name="deployment-site-password"
                type="password"
                autocomplete="new-password"
                value={form.sitePassword}
                disabled={form.busy !== false}
                onInput={(event) => setForm("sitePassword", event.currentTarget.value)}
              />
            </Field>
          </div>
          <p class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {t("boc.deployments.settings.site.help")}
          </p>
        </section>

        <div class="flex items-center justify-between gap-4 rounded-md border border-v2-border-border-muted px-3 py-2.5">
          <div class="flex min-w-0 items-center gap-1">
            <span class="truncate text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.settings.notifications.label")}
            </span>
            <DeploymentInfo
              t={t}
              topic={t("boc.deployments.settings.notifications.label")}
              value={t("boc.deployments.settings.notifications.help")}
            />
          </div>
          <Switch
            checked={form.notificationsEnabled}
            disabled={form.busy !== false}
            aria-label={t("boc.deployments.settings.notifications.label")}
            onChange={(checked) => setForm("notificationsEnabled", checked)}
          />
        </div>

        <Collapsible
          variant="ghost"
          class="!overflow-hidden !border !border-v2-border-border-muted"
          data-boc-deployment-settings-advanced
        >
          <Collapsible.Trigger class="!h-10 !cursor-pointer !px-3 hover:!bg-v2-background-bg-layer-02">
            <Icon name="outline-sliders" class="me-2 text-v2-icon-icon-muted" />
            <span class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.settings.advanced")}
            </span>
            <Collapsible.Arrow class="ms-auto !opacity-100" />
          </Collapsible.Trigger>
          <Collapsible.Content>
            <div class="flex flex-col gap-3 border-t border-v2-border-border-muted px-3 pb-3 pt-3">
              <p class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                {t("boc.deployments.settings.context")}
              </p>
              <Field>
                <Field.Label>{t("boc.deployments.settings.project.label")}</Field.Label>
                <TextInput
                  class="!w-full"
                  name="deployment-argo-project"
                  autocomplete="off"
                  spellcheck={false}
                  value={form.argoProject}
                  disabled={form.busy !== false}
                  onInput={(event) => setForm("argoProject", event.currentTarget.value)}
                />
              </Field>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field>
                  <Field.Label>{t("boc.deployments.settings.labelKey.label")}</Field.Label>
                  <TextInput
                    class="!w-full"
                    name="deployment-label-key"
                    autocomplete="off"
                    spellcheck={false}
                    value={form.applicationLabelKey}
                    disabled={form.busy !== false}
                    onInput={(event) => setForm("applicationLabelKey", event.currentTarget.value)}
                  />
                </Field>
                <Field>
                  <Field.Label>{t("boc.deployments.settings.labelValue.label")}</Field.Label>
                  <TextInput
                    class="!w-full"
                    name="deployment-label-value"
                    autocomplete="off"
                    spellcheck={false}
                    value={form.applicationLabelValue}
                    disabled={form.busy !== false}
                    onInput={(event) => setForm("applicationLabelValue", event.currentTarget.value)}
                  />
                </Field>
              </div>
            </div>
          </Collapsible.Content>
        </Collapsible>

        <div class="border-t border-v2-border-border-muted pt-4">
          <div class="mb-2 flex items-center gap-1">
            <h2 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.settings.readiness")}
            </h2>
            <DeploymentInfo
              t={t}
              topic={t("boc.deployments.settings.readiness")}
              value={t("boc.deployments.readiness.pendingHelp")}
            />
          </div>
          <DeploymentReadinessSummary t={t} readiness={form.readiness} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={form.busy !== false || dirty()} onClick={() => void retry()}>
          {form.busy === "retry" ? t("boc.deployments.readiness.retrying") : t("boc.deployments.settings.retry")}
        </Button>
        <Button type="button" variant="neutral" disabled={form.busy !== false} onClick={() => void save()}>
          {form.busy === "save" ? t("boc.deployments.settings.saving") : t("boc.deployments.settings.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function settingsFailureMessage(t: ReturnType<typeof createBocTranslator>, failure: DeploymentFailure) {
  if (failure.context?.field === "sitePassword") return t("boc.deployments.settings.site.encryptionUnavailable")
  if (failure.category === "unsafe-target") return t("boc.deployments.settings.failure.unsafe")
  return t("boc.deployments.settings.failure.invalid")
}
