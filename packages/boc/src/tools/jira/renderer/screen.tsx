import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createResource, Show } from "solid-js"
import type { BocScreenProps } from "../../../registry"
import { useBocDesktop } from "../../../renderer/desktop"
import { createBocTranslator } from "../../../renderer/i18n"
import { JiraSettingsDialog } from "./settings"
import { jiraStatusLabel } from "./status"

export default function JiraScreen(props: BocScreenProps) {
  const desktop = useBocDesktop()
  const t = createBocTranslator(props.host.locale)
  const dialog = useDialog()
  const [connection, { refetch }] = createResource(() => desktop?.jira.getConnectionStatus())

  if (!desktop) return null

  const openSettings = () => {
    void dialog.show(() => (
      <JiraSettingsDialog
        api={desktop.jira}
        locale={props.host.locale}
        openExternal={(url) => props.host.openExternal(url)}
        onChanged={() => void refetch()}
      />
    ))
  }

  const statusLabel = () => {
    const value = connection()
    if (!value) return t("boc.jira.connection.loading")
    return jiraStatusLabel(t, value)
  }

  return (
    <main data-boc-screen="jira" class="flex min-h-0 flex-1 px-2 pb-2 pt-2 text-v2-text-text-base">
      <section class="flex min-h-0 flex-1 flex-col rounded-lg bg-v2-background-bg-raised px-6 py-5">
        <div class="flex flex-col gap-1">
          <h1 class="text-[16px] font-medium leading-[var(--line-height-base)]">{t("boc.jira.placeholder.title")}</h1>
          <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {t("boc.jira.placeholder.description")}
          </p>
        </div>
        <div class="mt-6 flex flex-wrap items-center gap-3 text-[13px] leading-[var(--line-height-compact)]">
          <span class="text-v2-text-text-muted">{t("boc.jira.connection.label")}</span>
          <span data-boc-connection-status class="font-medium">
            <Show when={!connection.loading} fallback={t("boc.jira.connection.loading")}>
              {statusLabel()}
            </Show>
          </span>
          <Button type="button" variant="outline" size="small" onClick={openSettings}>
            {t("boc.jira.connection.settings")}
          </Button>
        </div>
      </section>
    </main>
  )
}
