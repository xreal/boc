import { Button } from "@opencode-ai/ui/button"
import { createEffect, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useBocDesktop } from "../../../renderer/desktop"
import { useBocHost } from "../../../renderer/host"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail } from "../domain/board"
import { JiraSessionInstructionFields } from "./session-instructions"
import { jiraSessionPrompt } from "../domain/sessions"

export function JiraIssueSessions(props: { issue: JiraIssueDetail; t: BocTranslator }) {
  const host = useBocHost()
  const desktop = useBocDesktop()
  const [form, setForm] = createStore({ before: "", after: "", busy: false, error: "" })
  const [defaults, { refetch: retryDefaults }] = createResource(() =>
    desktop?.jira.getSessionInstructions().catch(() => undefined),
  )
  createEffect(() => {
    const value = defaults()
    if (value) setForm(value)
  })
  const disabled = () => form.busy || defaults.loading || !defaults()
  const [sessions, { refetch }] = createResource(
    () => props.issue.url,
    async (issueUrl) => {
      if (!desktop) return { links: [], failed: false }
      return desktop.jira.listSessionLinks({ issueUrl }).then(
        (links) => ({ links, failed: false }),
        () => ({ links: [], failed: true }),
      )
    },
  )

  async function start() {
    if (disabled() || !host.sessions) return
    setForm({ busy: true, error: "" })
    await host.sessions
      .start({
        issueUrl: props.issue.url,
        title: `${props.issue.key}: ${props.issue.summary}`,
        prompt: jiraSessionPrompt(props.issue, form.before, form.after),
      })
      .catch((error: unknown) => {
        setForm("error", error instanceof Error ? error.message : props.t("boc.jira.sessions.startFailed"))
      })
      .finally(() => setForm("busy", false))
  }

  return (
    <Show when={host.sessions}>
      <section class="flex flex-col gap-2 border-t border-v2-border-border-muted pt-4">
        <h3 class="text-[12px] text-v2-text-text-muted [font-weight:530]">{props.t("boc.jira.sessions.title")}</h3>
        <details>
          <summary class="cursor-pointer text-v2-text-text-muted">{props.t("boc.jira.sessions.instructions")}</summary>
          <JiraSessionInstructionFields
            t={props.t}
            value={form}
            disabled={disabled()}
            onChange={(field, value) => setForm(field, value)}
          />
        </details>
        <Button size="small" variant="neutral" disabled={disabled()} onClick={() => void start()}>
          {props.t("boc.jira.sessions.start")}
        </Button>
        <p class="text-[12px] text-v2-text-text-faint">{props.t("boc.jira.sessions.review")}</p>
        <Show when={!defaults.loading && !defaults()}>
          <p role="alert">{props.t("boc.jira.sessions.defaults.loadFailed")}</p>
          <Button size="small" variant="ghost-muted" onClick={() => void retryDefaults()}>
            {props.t("boc.jira.board.refresh")}
          </Button>
        </Show>
        <Show when={form.error}>
          <p role="alert" class="text-v2-state-fg-danger">
            {form.error}
          </p>
        </Show>
        <Show when={sessions()?.failed}>
          <p role="alert">{props.t("boc.jira.sessions.loadFailed")}</p>
          <Button size="small" variant="ghost-muted" onClick={() => void refetch()}>
            {props.t("boc.jira.board.refresh")}
          </Button>
        </Show>
        <Show when={!sessions.loading && !sessions()?.failed && sessions()?.links.length === 0}>
          <p class="text-[12px] text-v2-text-text-faint">{props.t("boc.jira.sessions.empty")}</p>
        </Show>
        <For each={sessions()?.links}>
          {(link) => (
            <Button
              class="w-full min-w-0 justify-between gap-2"
              size="small"
              variant="ghost-muted"
              onClick={() => {
                if (!link.sessionID) return
                setForm("error", "")
                void host.sessions
                  ?.open(link.server, link.sessionID)
                  .catch(() => setForm("error", props.t("boc.jira.sessions.unavailable")))
              }}
            >
              <span class="truncate">{link.title}</span>
              <span class="shrink-0 text-v2-text-text-faint">
                {new Date(link.createdAt).toLocaleString(host.locale())}
              </span>
            </Button>
          )}
        </For>
      </section>
    </Show>
  )
}
