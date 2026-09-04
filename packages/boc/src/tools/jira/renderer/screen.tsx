import { createResource, Show } from "solid-js"
import type { BocScreenProps } from "../../../registry"
import { useBocDesktop } from "../../../renderer/desktop"
import { createBocTranslator } from "../../../renderer/i18n"

export default function JiraScreen(props: BocScreenProps) {
  const desktop = useBocDesktop()
  if (!desktop) return null

  const t = createBocTranslator(props.host.locale)
  const [connection] = createResource(() => desktop.jira.getConnectionStatus())

  return (
    <main data-boc-screen="jira" class="flex min-h-0 flex-1 px-2 pb-2 pt-2 text-v2-text-text-base">
      <section class="flex min-h-0 flex-1 flex-col rounded-lg bg-v2-background-bg-raised px-6 py-5">
        <div class="flex flex-col gap-1">
          <h1 class="text-[16px] font-medium leading-[var(--line-height-base)]">{t("boc.jira.placeholder.title")}</h1>
          <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            {t("boc.jira.placeholder.description")}
          </p>
        </div>
        <div class="mt-6 flex items-center gap-2 text-[13px] leading-[var(--line-height-compact)]">
          <span class="text-v2-text-text-muted">{t("boc.jira.connection.label")}</span>
          <span data-boc-connection-status class="font-medium">
            <Show when={connection()} fallback={t("boc.jira.connection.loading")}>
              {(connection) => (connection().status === "not-configured" ? t("boc.jira.connection.notConfigured") : "")}
            </Show>
          </span>
        </div>
      </section>
    </main>
  )
}
