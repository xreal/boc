import { Button } from "@opencode-ai/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { Field } from "@opencode-ai/ui/field"
import { TextInput } from "@opencode-ai/ui/text-input"
import { createEffect, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createBocTranslator } from "../../../renderer/i18n"
import { normalizeSavedBoards, type JiraBoardSummary } from "../domain/board"
import type { JiraConnectionAttempt, JiraConnectionStatus } from "../rpcs"
import { jiraConnectionMessage, jiraConnectionMessageKind, type JiraConnectionBusy } from "./status"

const TOKEN_SETTINGS_URL = "https://id.atlassian.com/manage-profile/security/api-tokens"

export function JiraSettingsDialog(props: {
  api: BocDesktopAPI["jira"]
  locale: () => string
  openExternal: (url: string) => void
  onChanged?: () => void
}) {
  const t = createBocTranslator(props.locale)
  const [connection, { refetch }] = createResource(() => props.api.getConnectionStatus())
  const [preferences, { refetch: refetchPreferences }] = createResource(() => props.api.getPreferences())
  const [form, setForm] = createStore({
    site: "",
    email: "",
    token: "",
    hydrated: false,
    busy: false as JiraConnectionBusy,
    savingPreferences: false,
    attempt: undefined as JiraConnectionAttempt | undefined,
    notice: undefined as "saved" | "disconnected" | undefined,
  })

  createEffect(() => {
    const value = connection()
    if (!value || form.hydrated) return
    setForm({
      site: storedSite(value),
      email: storedEmail(value),
      hydrated: true,
    })
  })

  const encryptionAvailable = () => connection()?.encryptionAvailable !== false
  const configured = () => connection()?.status === "connected"
  const busy = () => form.busy !== false || form.savingPreferences

  const run = async (
    action: Exclude<JiraConnectionBusy, false>,
    work: () => Promise<JiraConnectionAttempt | JiraConnectionStatus>,
  ) => {
    if (busy()) return
    setForm({ busy: action, attempt: undefined, notice: undefined })
    const result = await work()
    setForm("busy", false)
    if ("ok" in result) {
      setForm("attempt", result)
      if (!result.ok) return
      setForm("site", result.site)
      setForm("email", result.email)
      if (action !== "save") return
      setForm("token", "")
      setForm("notice", "saved")
      void refetch()
      void refetchPreferences()
      props.onChanged?.()
      return
    }
    setForm({
      site: "",
      email: "",
      token: "",
      notice: "disconnected",
      hydrated: true,
    })
    void refetch()
    void refetchPreferences()
    props.onChanged?.()
  }

  const savePreferences = async (savedBoards: readonly JiraBoardSummary[], defaultBoardId?: number) => {
    if (busy()) return
    setForm("savingPreferences", true)
    await props.api.savePreferences(normalizeSavedBoards(savedBoards, defaultBoardId))
    setForm("savingPreferences", false)
    void refetchPreferences()
    props.onChanged?.()
  }

  const message = () =>
    jiraConnectionMessage(t, {
      busy: form.busy,
      notice: form.notice,
      attempt: form.attempt,
      status: connection(),
    })

  const messageKind = () =>
    jiraConnectionMessageKind({
      busy: form.busy,
      notice: form.notice,
      attempt: form.attempt,
      status: connection(),
    })

  return (
    <Dialog fit data-boc-dialog="jira-settings">
      <DialogHeader closeLabel={t("boc.jira.connection.close")}>
        <DialogTitleGroup
          title={t("boc.jira.connection.settings.title")}
          description={t("boc.jira.connection.settings.description")}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-4 pb-4">
        <p
          data-boc-connection-message
          data-kind={messageKind()}
          class="text-[13px] leading-[var(--line-height-compact)]"
          classList={{
            "text-v2-text-text-muted": messageKind() === "muted",
            "text-v2-state-fg-success": messageKind() === "success",
            "text-v2-state-fg-danger": messageKind() === "danger",
            "text-v2-state-fg-warning": messageKind() === "warning",
          }}
        >
          {message()}
        </p>
        <Show when={!encryptionAvailable()}>
          <p
            data-boc-encryption-warning
            class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-warning"
          >
            {t("boc.jira.connection.encryption.warning")}
          </p>
        </Show>
        <Field>
          <Field.Label>{t("boc.jira.connection.site.label")}</Field.Label>
          <TextInput
            autofocus
            class="!w-full"
            name="jira-site"
            autocomplete="off"
            spellcheck={false}
            placeholder={t("boc.jira.connection.site.placeholder")}
            value={form.site}
            disabled={busy()}
            onInput={(event) => setForm("site", event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Field.Label>{t("boc.jira.connection.email.label")}</Field.Label>
          <TextInput
            class="!w-full"
            name="jira-email"
            type="email"
            autocomplete="off"
            spellcheck={false}
            placeholder={t("boc.jira.connection.email.placeholder")}
            value={form.email}
            disabled={busy()}
            onInput={(event) => setForm("email", event.currentTarget.value)}
          />
        </Field>
        <Field>
          <Field.Label>{t("boc.jira.connection.token.label")}</Field.Label>
          <TextInput
            class="!w-full"
            name="jira-token"
            type="password"
            autocomplete="off"
            spellcheck={false}
            placeholder={t("boc.jira.connection.token.placeholder")}
            value={form.token}
            disabled={busy()}
            onInput={(event) => setForm("token", event.currentTarget.value)}
          />
          <Field.Prefix>
            <button
              type="button"
              class="text-left text-v2-text-text-muted underline-offset-2 hover:text-v2-text-text-base hover:underline"
              onClick={() => props.openExternal(TOKEN_SETTINGS_URL)}
            >
              {t("boc.jira.connection.token.helpLink")}
            </button>
            <span class="mt-1 block">{t("boc.jira.connection.token.help")}</span>
          </Field.Prefix>
        </Field>
        <Show when={configured()}>
          <div data-boc-saved-boards class="flex flex-col gap-2 border-t border-v2-border-border-muted pt-4">
            <h2 class="text-[13px] font-medium leading-[var(--line-height-compact)]">
              {t("boc.jira.board.savedBoards.title")}
            </h2>
            <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
              {t("boc.jira.board.savedBoards.description")}
            </p>
            <Show
              when={(preferences()?.savedBoards.length ?? 0) > 0}
              fallback={
                <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                  {t("boc.jira.board.savedBoards.empty")}
                </p>
              }
            >
              <ul class="flex flex-col gap-2">
                <For each={preferences()?.savedBoards ?? []}>
                  {(board) => (
                    <li
                      data-boc-saved-board={board.id}
                      class="flex flex-wrap items-center gap-2 text-[13px] leading-[var(--line-height-compact)]"
                    >
                      <span class="min-w-0 flex-1 truncate">{board.name}</span>
                      <Show
                        when={preferences()?.defaultBoardId === board.id}
                        fallback={
                          <Button
                            type="button"
                            variant="ghost"
                            size="small"
                            disabled={busy()}
                            onClick={() => void savePreferences(preferences()?.savedBoards ?? [], board.id)}
                          >
                            {t("boc.jira.board.savedBoards.setDefault")}
                          </Button>
                        }
                      >
                        <span class="text-v2-text-text-muted">{t("boc.jira.board.savedBoards.default")}</span>
                      </Show>
                      <Button
                        type="button"
                        variant="ghost"
                        size="small"
                        disabled={busy()}
                        onClick={() =>
                          void savePreferences(
                            (preferences()?.savedBoards ?? []).filter((entry) => entry.id !== board.id),
                            preferences()?.defaultBoardId,
                          )
                        }
                      >
                        {t("boc.jira.board.savedBoards.remove")}
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </Show>
      </DialogBody>
      <DialogFooter>
        <Show when={configured()}>
          <Button
            type="button"
            variant="danger"
            disabled={busy()}
            onClick={() => void run("disconnect", () => props.api.disconnect())}
          >
            {t("boc.jira.connection.disconnect")}
          </Button>
        </Show>
        <Button
          type="button"
          variant="outline"
          disabled={busy()}
          onClick={() =>
            void run("test", () => props.api.testConnection({ site: form.site, email: form.email, token: form.token }))
          }
        >
          {t("boc.jira.connection.test")}
        </Button>
        <Button
          type="button"
          variant="neutral"
          disabled={busy() || !encryptionAvailable()}
          onClick={() =>
            void run("save", () => props.api.saveConnection({ site: form.site, email: form.email, token: form.token }))
          }
        >
          {t("boc.jira.connection.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function storedSite(status: JiraConnectionStatus) {
  if (status.status === "not-configured") return ""
  return status.site ?? ""
}

function storedEmail(status: JiraConnectionStatus) {
  if (status.status === "not-configured") return ""
  return status.email ?? ""
}
