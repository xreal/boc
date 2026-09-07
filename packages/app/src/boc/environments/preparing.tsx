import { createBocTranslator } from "@boc/extensions/renderer"
import { Icon } from "@opencode-ai/ui/icon"
import { onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import type { PendingSession } from "@/shell/tabs/tabs"
import { environmentDuration } from "./model"

export function BocPreparingCheckout(props: { pending: PendingSession }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const server = useServer()
  const [clock, setClock] = createStore({ now: Date.now() })
  const timer = setInterval(() => setClock("now", Date.now()), 1000)
  onCleanup(() => clearInterval(timer))

  return (
    <div
      data-boc-preparing-checkout
      class="mt-3 flex flex-col gap-3 rounded-lg border border-v2-border-border-base bg-v2-background-bg-base p-4 text-12-regular leading-text-base text-v2-text-text-muted"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span>{t("boc.environments.preparing.context")}</span>
        <span class="tabular-nums">
          {t("boc.environments.details.runtime", {
            duration: environmentDuration(props.pending.message.time.created, clock.now),
          })}
        </span>
      </div>
      <dl class="m-0 grid min-w-0 gap-2">
        <div>
          <dt>{t("boc.environments.preparing.source")}</dt>
          <dd class="m-0 text-v2-text-text-base">
            <bdi dir="ltr" class="break-all">
              {props.pending.draft.directory}
            </bdi>
          </dd>
        </div>
        <Show when={props.pending.draft.branch}>
          {(branch) => (
            <div>
              <dt>{t("boc.environments.preparing.branch")}</dt>
              <dd class="m-0 text-v2-text-text-base">
                <bdi dir="ltr" class="break-all">
                  {branch()}
                </bdi>
              </dd>
            </div>
          )}
        </Show>
      </dl>
      <p
        class="m-0 flex items-start gap-2"
        role="status"
        classList={{ "text-v2-state-fg-warning": server.ctx.sdk.connection.status() !== "connected" }}
      >
        <Icon name="info" size="small" class="mt-0.5 shrink-0" />
        {server.ctx.sdk.connection.status() === "connected"
          ? t("boc.environments.preparing.waiting")
          : t("boc.environments.preparing.disconnected")}
      </p>
    </div>
  )
}
