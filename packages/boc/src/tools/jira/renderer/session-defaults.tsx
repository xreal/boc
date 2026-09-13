import { Button } from "@opencode/ui/button"
import { Checkbox } from "@opencode/ui/checkbox"
import { Tabs } from "@opencode/ui/tabs"
import { TextInput } from "@opencode/ui/text-input"
import { createEffect, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import type { BocTranslator } from "../../../renderer/i18n"
import {
  defaultJiraSessionInstructions,
  isJiraSessionModelReference,
  jiraSessionDifficulties,
} from "../domain/sessions"
import { JiraSessionInstructionFields } from "./session-instructions"

export function JiraSessionDefaultsSettings(props: {
  api: BocDesktopAPI["jira"]
  t: BocTranslator
  activeTab: string
  onSaved?: () => void
}) {
  const [defaults, { refetch }] = createResource(() => props.api.getSessionInstructions().catch(() => undefined))
  const [form, setForm] = createStore({
    ...defaultJiraSessionInstructions,
    busy: false,
    notice: "" as "" | "prompts-saved" | "models-saved" | "failed",
  })
  createEffect(() => {
    const value = defaults()
    if (value) setForm(value)
  })
  const disabled = () => defaults.loading || !defaults() || form.busy
  const valid = () =>
    jiraSessionDifficulties.every((difficulty) => isJiraSessionModelReference(form.models[difficulty].model))

  async function save(notice: "prompts-saved" | "models-saved") {
    if (disabled() || !valid()) return
    setForm({ busy: true, notice: "" })
    await props.api
      .saveSessionInstructions({
        before: form.before,
        after: form.after,
        review: form.review,
        modelDefaultsVersion: form.modelDefaultsVersion,
        models: form.models,
      })
      .then(
        () => {
          setForm("notice", notice)
          props.onSaved?.()
        },
        () => setForm("notice", "failed"),
      )
      .finally(() => setForm("busy", false))
  }

  const loadFailure = () => (
    <Show when={!defaults.loading && !defaults()}>
      <p role="alert">{props.t("boc.jira.sessions.defaults.loadFailed")}</p>
      <Button size="small" variant="ghost-muted" onClick={() => void refetch()}>
        {props.t("boc.jira.board.refresh")}
      </Button>
    </Show>
  )

  return (
    <>
      <Tabs.Content value="prompts" forceMount class="pt-4" classList={{ hidden: props.activeTab !== "prompts" }}>
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
          <label class="flex flex-col gap-1 text-[13px] leading-[var(--line-height-base)]">
            {props.t("boc.jira.sessions.defaults.reviewLabel")}
            <span class="text-v2-text-text-muted">{props.t("boc.jira.sessions.defaults.reviewDescription")}</span>
            <textarea
              rows={8}
              value={form.review}
              disabled={disabled()}
              onInput={(event) => setForm({ review: event.currentTarget.value, notice: "" })}
              class="resize-y rounded border border-v2-border-border-base bg-v2-background-bg-base p-2 text-v2-text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus disabled:opacity-50"
            />
          </label>
          {loadFailure()}
          <div class="flex flex-wrap gap-2">
            <Button
              size="small"
              variant="ghost-muted"
              disabled={disabled()}
              onClick={() =>
                setForm({
                  before: defaultJiraSessionInstructions.before,
                  after: defaultJiraSessionInstructions.after,
                  review: defaultJiraSessionInstructions.review,
                  notice: "",
                })
              }
            >
              {props.t("boc.jira.sessions.defaults.reset")}
            </Button>
            <Button size="small" variant="neutral" disabled={disabled()} onClick={() => void save("prompts-saved")}>
              {props.t("boc.jira.sessions.defaults.save")}
            </Button>
          </div>
          <SaveNotice form={form} section="prompts" t={props.t} />
        </section>
      </Tabs.Content>
      <Tabs.Content value="models" forceMount class="pt-4" classList={{ hidden: props.activeTab !== "models" }}>
        <section class="flex flex-col gap-3" aria-busy={defaults.loading || form.busy}>
          <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">
            {props.t("boc.jira.sessions.models.description")}
          </p>
          <For each={jiraSessionDifficulties}>
            {(difficulty) => (
              <div class="flex flex-col gap-2 rounded-md border border-v2-border-border-muted p-3">
                <label class="flex flex-col gap-1 text-[13px] leading-[var(--line-height-compact)]">
                  {props.t(`boc.jira.sessions.difficulty.${difficulty}`)}
                  <TextInput
                    class="!w-full"
                    name={`jira-session-model-${difficulty}`}
                    autocomplete="off"
                    spellcheck={false}
                    value={form.models[difficulty].model}
                    disabled={disabled()}
                    onInput={(event) => {
                      setForm({
                        models: {
                          ...form.models,
                          [difficulty]: { ...form.models[difficulty], model: event.currentTarget.value },
                        },
                        notice: "",
                      })
                    }}
                  />
                </label>
                <div class="[--border-weak-base:var(--v2-border-border-strong)] [--surface-weak:var(--v2-background-bg-layer-02)]">
                  <Checkbox
                    checked={form.models[difficulty].preserveOnUpdate}
                    disabled={disabled()}
                    onChange={(checked) => {
                      setForm({
                        models: {
                          ...form.models,
                          [difficulty]: { ...form.models[difficulty], preserveOnUpdate: checked },
                        },
                        notice: "",
                      })
                    }}
                  >
                    {props.t("boc.jira.sessions.models.preserveOnUpdate")}
                  </Checkbox>
                </div>
              </div>
            )}
          </For>
          <Show when={!valid()}>
            <p role="alert" class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-danger">
              {props.t("boc.jira.sessions.models.invalid")}
            </p>
          </Show>
          {loadFailure()}
          <div class="flex flex-wrap gap-2">
            <Button
              size="small"
              variant="ghost-muted"
              disabled={disabled()}
              onClick={() =>
                setForm({
                  modelDefaultsVersion: defaultJiraSessionInstructions.modelDefaultsVersion,
                  models: defaultJiraSessionInstructions.models,
                  notice: "",
                })
              }
            >
              {props.t("boc.jira.sessions.models.reset")}
            </Button>
            <Button
              size="small"
              variant="neutral"
              disabled={disabled() || !valid()}
              onClick={() => void save("models-saved")}
            >
              {props.t("boc.jira.sessions.models.save")}
            </Button>
          </div>
          <SaveNotice form={form} section="models" t={props.t} />
        </section>
      </Tabs.Content>
    </>
  )
}

function SaveNotice(props: {
  form: { notice: "" | "prompts-saved" | "models-saved" | "failed" }
  section: "prompts" | "models"
  t: BocTranslator
}) {
  const visible = () => props.form.notice === "failed" || props.form.notice === `${props.section}-saved`
  return (
    <Show when={visible()}>
      <p
        role={props.form.notice === "failed" ? "alert" : "status"}
        class="text-[13px] leading-[var(--line-height-base)]"
      >
        {props.t(
          props.form.notice === "failed"
            ? "boc.jira.sessions.defaults.saveFailed"
            : props.section === "models"
              ? "boc.jira.sessions.models.saved"
              : "boc.jira.sessions.defaults.saved",
        )}
      </p>
    </Show>
  )
}
