import { JiraSessionDefaultsSettings } from "./session-defaults"
import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Field } from "@opencode/ui/field"
import { Select } from "@opencode/ui/select"
import { Tabs } from "@opencode/ui/tabs"
import { TextInput } from "@opencode/ui/text-input"
import { createEffect, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocDesktopAPI } from "../../../desktop/renderer/api"
import { createBocTranslator } from "../../../renderer/i18n"
import { normalizeSavedBoards, type JiraBoardSummary, type JiraProjectTarget } from "../domain/board"
import type { JiraConnectionAttempt, JiraConnectionStatus } from "../rpcs"
import { jiraConnectionMessage, jiraConnectionMessageKind, type JiraConnectionBusy } from "./status"

const TOKEN_SETTINGS_URL = "https://id.atlassian.com/manage-profile/security/api-tokens"

export function JiraSettingsDialog(props: {
  api: BocDesktopAPI["jira"]
  locale: () => string
  openExternal: (url: string) => void
  projects: { server: string; directory: string; label: string }[]
  initialTab?: "connection" | "boards" | "prompts" | "models"
  onChanged?: () => void
  onNeedsDefaultBoard?: () => void
}) {
  const t = createBocTranslator(props.locale)
  let tokenInput: HTMLInputElement | undefined
  const [connection, { refetch }] = createResource(() => props.api.getConnectionStatus())
  const [preferences, { refetch: refetchPreferences }] = createResource(() => props.api.getPreferences())
  const [form, setForm] = createStore({
    tab: props.initialTab ?? "connection",
    site: "",
    email: "",
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
      if (tokenInput) tokenInput.value = ""
      setForm("notice", "saved")
      const preferences = await props.api.getPreferences()
      void refetch()
      void refetchPreferences()
      if (preferences.defaultBoardId === undefined && props.onNeedsDefaultBoard) {
        props.onNeedsDefaultBoard()
        return
      }
      props.onChanged?.()
      return
    }
    setForm({
      site: "",
      email: "",
      notice: "disconnected",
      hydrated: true,
    })
    void refetch()
    void refetchPreferences()
    props.onChanged?.()
  }

  const savePreferences = async (
    savedBoards: readonly JiraBoardSummary[],
    defaultBoardId?: number,
    projectTargets: readonly JiraProjectTarget[] = preferences()?.projectTargets ?? [],
  ) => {
    if (busy()) return
    setForm("savingPreferences", true)
    await props.api.savePreferences(normalizeSavedBoards(savedBoards, defaultBoardId, projectTargets))
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
    <Dialog
      containerClass="!w-[min(34rem,calc(100vw-2rem))] !h-[min(36.5rem,calc(100dvh-2rem))]"
      data-boc-dialog="jira-settings"
    >
      <DialogHeader closeLabel={t("boc.jira.connection.close")}>
        <DialogTitleGroup
          title={t("boc.jira.connection.settings.title")}
          description={t("boc.jira.connection.settings.description")}
        />
      </DialogHeader>
      <DialogBody class="min-h-0 px-4 pb-4">
        <Tabs
          variant="line"
          value={form.tab}
          onChange={(tab) => {
            if (tab !== "connection" && tab !== "boards" && tab !== "prompts" && tab !== "models") return
            setForm("tab", tab)
          }}
          class="min-h-0"
        >
          <Tabs.List aria-label={t("boc.jira.connection.settings")} class="shrink-0">
            <Tabs.Trigger value="connection">{t("boc.jira.settings.tab.connection")}</Tabs.Trigger>
            <Tabs.Trigger value="boards">{t("boc.jira.settings.tab.boards")}</Tabs.Trigger>
            <Tabs.Trigger value="prompts">{t("boc.jira.settings.tab.prompts")}</Tabs.Trigger>
            <Tabs.Trigger value="models">{t("boc.jira.settings.tab.models")}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="connection" forceMount class="pt-4" classList={{ hidden: form.tab !== "connection" }}>
            <div class="flex flex-col gap-4">
              <p
                data-boc-connection-message
                data-kind={messageKind()}
                role="status"
                aria-live="polite"
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
                  role="status"
                  class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-warning"
                >
                  {t("boc.jira.connection.encryption.warning")}
                </p>
              </Show>
              <Field>
                <Field.Label>{t("boc.jira.connection.site.label")}</Field.Label>
                <TextInput
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
                  autocomplete="new-password"
                  spellcheck={false}
                  placeholder={t("boc.jira.connection.token.placeholder")}
                  ref={(element) => (tokenInput = element)}
                  disabled={busy()}
                />
                <Field.Prefix>
                  <button
                    type="button"
                    class="rounded-sm text-left text-v2-text-text-muted underline underline-offset-2 outline-none hover:text-v2-text-text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-border-border-focus"
                    onClick={() => props.openExternal(TOKEN_SETTINGS_URL)}
                  >
                    {t("boc.jira.connection.token.helpLink")}
                  </button>
                  <span class="mt-1 block">{t("boc.jira.connection.token.help")}</span>
                </Field.Prefix>
              </Field>

              <div class="flex flex-wrap justify-end gap-2 pt-2">
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
                    void run("test", () =>
                      props.api.testConnection({ site: form.site, email: form.email, token: tokenInput?.value ?? "" }),
                    )
                  }
                >
                  {t("boc.jira.connection.test")}
                </Button>
                <Button
                  type="button"
                  variant="neutral"
                  disabled={busy() || !encryptionAvailable()}
                  onClick={() =>
                    void run("save", () =>
                      props.api.saveConnection({ site: form.site, email: form.email, token: tokenInput?.value ?? "" }),
                    )
                  }
                >
                  {t("boc.jira.connection.save")}
                </Button>
              </div>
            </div>
          </Tabs.Content>
          <Tabs.Content value="boards" forceMount class="pt-4" classList={{ hidden: form.tab !== "boards" }}>
            <Show
              when={configured()}
              fallback={
                <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">
                  {t("boc.jira.settings.boards.connect")}
                </p>
              }
            >
              <div data-boc-saved-boards aria-busy={form.savingPreferences} class="flex flex-col gap-3">
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
                          class="flex flex-col gap-2 border-b border-v2-border-border-muted pb-3 text-[13px] leading-[var(--line-height-compact)] last:border-b-0 last:pb-0"
                        >
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="min-w-0 flex-1 truncate">{board.name}</span>
                            <Show
                              when={preferences()?.defaultBoardId === board.id}
                              fallback={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="small"
                                  disabled={busy()}
                                  aria-label={t("boc.jira.board.savedBoards.setDefaultLabel", { board: board.name })}
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
                              aria-label={t("boc.jira.board.savedBoards.removeLabel", { board: board.name })}
                              onClick={() =>
                                void savePreferences(
                                  (preferences()?.savedBoards ?? []).filter((entry) => entry.id !== board.id),
                                  preferences()?.defaultBoardId,
                                )
                              }
                            >
                              {t("boc.jira.board.savedBoards.remove")}
                            </Button>
                          </div>
                          <div class="flex min-w-0 flex-col gap-1">
                            <span class="text-v2-text-text-muted">{t("boc.jira.board.project.title")}</span>
                            <Select
                              class="!w-full min-w-0"
                              valueClass="block min-w-0 truncate"
                              contentClass="!w-[min(30rem,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)]"
                              placement="bottom-start"
                              aria-label={t("boc.jira.board.project.label", { board: board.name })}
                              options={props.projects}
                              current={props.projects.find((project) => {
                                const target = preferences()?.projectTargets?.find((item) => item.boardId === board.id)
                                return project.server === target?.server && project.directory === target.directory
                              })}
                              value={(project) => `${project.server}:${project.directory}`}
                              label={(project) => project.label}
                              placeholder={t("boc.jira.board.project.placeholder")}
                              disabled={busy()}
                              onSelect={(project) => {
                                if (!project) return
                                const targets = (preferences()?.projectTargets ?? []).filter(
                                  (target) => target.boardId !== board.id,
                                )
                                void savePreferences(preferences()?.savedBoards ?? [], preferences()?.defaultBoardId, [
                                  ...targets,
                                  { boardId: board.id, server: project.server, directory: project.directory },
                                ])
                              }}
                            >
                              {(project) => <span class="block min-w-0 truncate">{project.label}</span>}
                            </Select>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </div>
            </Show>
          </Tabs.Content>
          <JiraSessionDefaultsSettings api={props.api} t={t} activeTab={form.tab} onSaved={props.onChanged} />
        </Tabs>
      </DialogBody>
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
