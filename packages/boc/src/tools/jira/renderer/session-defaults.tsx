import { Button } from "@opencode-ai/ui/button"
import { createEffect, createResource, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import type { BocTranslator } from "../../../renderer/i18n"
import { defaultJiraSessionInstructions } from "../domain/sessions"
import { JiraSessionInstructionFields } from "./session-instructions"

export function JiraSessionDefaultsSettings(props: {
  api: BocDesktopAPI["jira"]
  t: BocTranslator
  onSaved?: () => void
}) {
  const [defaults, { refetch }] = createResource(() => props.api.getSessionInstructions().catch(() => undefined))
  const [form, setForm] = createStore({
    ...defaultJiraSessionInstructions,
    busy: false,
    notice: "" as "" | "saved" | "failed",
  })
  createEffect(() => {
    const value = defaults()
    if (value) setForm(value)
  })
  const disabled = () => defaults.loading || !defaults() || form.busy

  async function save() {
    if (disabled()) return
    setForm({ busy: true, notice: "" })
    await props.api
      .saveSessionInstructions({ before: form.before, after: form.after })
      .then(
        () => {
          setForm("notice", "saved")
          props.onSaved?.()
        },
        () => setForm("notice", "failed"),
      )
      .finally(() => setForm("busy", false))
  }

  return (
    <section class="flex flex-col gap-3" aria-busy={defaults.loading || form.busy}>
      <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">
        {props.t("boc.jira.sessions.defaults.description")}
      </p>
      <JiraSessionInstructionFields
        t={props.t}
        value={form}
        disabled={disabled()}
        onChange={(field, value) => setForm({ [field]: value, notice: "" })}
      />
      <Show when={!defaults.loading && !defaults()}>
        <p role="alert">{props.t("boc.jira.sessions.defaults.loadFailed")}</p>
        <Button size="small" variant="ghost-muted" onClick={() => void refetch()}>
          {props.t("boc.jira.board.refresh")}
        </Button>
      </Show>
      <div class="flex flex-wrap gap-2">
        <Button
          size="small"
          variant="ghost-muted"
          disabled={disabled()}
          onClick={() => setForm({ ...defaultJiraSessionInstructions, notice: "" })}
        >
          {props.t("boc.jira.sessions.defaults.reset")}
        </Button>
        <Button size="small" variant="neutral" disabled={disabled()} onClick={() => void save()}>
          {props.t("boc.jira.sessions.defaults.save")}
        </Button>
      </div>
      <Show when={form.notice}>
        <p role={form.notice === "failed" ? "alert" : "status"} class="text-[13px] leading-[var(--line-height-base)]">
          {props.t(
            form.notice === "failed" ? "boc.jira.sessions.defaults.saveFailed" : "boc.jira.sessions.defaults.saved",
          )}
        </p>
      </Show>
    </section>
  )
}
