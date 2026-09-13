import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Menu } from "@opencode/ui/menu"
import { SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from "@opencode/ui/split-button"
import "./sessions.css"
import { createEffect, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useBocDesktop } from "../../../renderer/desktop"
import { useBocHost } from "../../../renderer/host"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail } from "../domain/issue"
import { JiraSessionInstructionFields } from "./session-instructions"
import {
  defaultJiraSessionInstructions,
  jiraSessionDifficulties,
  jiraSessionModel,
  jiraSessionPrompt,
  type JiraSessionDifficulty,
} from "../domain/sessions"

export function JiraIssueSessions(props: {
  issue: JiraIssueDetail
  boardId: number
  t: BocTranslator
  onNavigate?: () => void
}) {
  const host = useBocHost()
  const desktop = useBocDesktop()
  const [form, setForm] = createStore({
    ...defaultJiraSessionInstructions,
    difficulty: "default" as JiraSessionDifficulty,
    busy: false,
    error: "",
  })
  const [defaults, { refetch: retryDefaults }] = createResource(() =>
    desktop?.jira.getSessionInstructions().catch(() => undefined),
  )
  const [preferences, { refetch: retryProject }] = createResource(() =>
    desktop?.jira.getPreferences().catch(() => undefined),
  )
  createEffect(() => {
    const value = defaults()
    if (value) setForm(value)
  })
  const target = () => preferences()?.projectTargets?.find((item) => item.boardId === props.boardId)
  const disabled = () => form.busy || defaults.loading || preferences.loading || !defaults() || !target()
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
    const project = target()
    if (disabled() || !host.sessions || !project) return
    setForm({ busy: true, error: "" })
    await host.sessions
      .start({
        issueUrl: props.issue.url,
        title: `${props.issue.key}: ${props.issue.summary}`,
        prompt: jiraSessionPrompt(props.issue, form.before, form.after),
        model: jiraSessionModel(form.models[form.difficulty].model),
        target: project,
      })
      .then(() => props.onNavigate?.())
      .catch((error: unknown) => {
        setForm("error", error instanceof Error ? error.message : props.t("boc.jira.sessions.startFailed"))
      })
      .finally(() => setForm("busy", false))
  }

  return (
    <Show when={host.sessions}>
      <section
        aria-label={props.t("boc.jira.ticket.sessions")}
        class="flex flex-col gap-3 border-t border-v2-border-border-muted pt-4"
      >
        <h3 class="text-[12px] text-v2-text-text-muted [font-weight:530]">{props.t("boc.jira.ticket.sessions")}</h3>
        <SplitButton data-boc-jira-session-start>
          <SplitButtonAction disabled={disabled()} aria-busy={form.busy} onClick={() => void start()}>
            <Show when={form.busy}>
              <Loader class="size-3" />
            </Show>
            {props.t("boc.jira.sessions.start")}
          </SplitButtonAction>
          <Menu placement="bottom-end" gutter={4}>
            <Menu.Trigger
              as={SplitButtonMenuTrigger}
              disabled={disabled()}
              aria-label={props.t("boc.jira.sessions.difficulty.select", {
                difficulty: props.t(`boc.jira.sessions.difficulty.${form.difficulty}`),
              })}
            >
              {props.t(`boc.jira.sessions.difficulty.${form.difficulty}`)}
              <Icon name="chevron-down" size="small" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content class="min-w-56 max-w-[calc(100vw-2rem)]">
                <Menu.Group>
                  <Menu.GroupLabel>{props.t("boc.jira.sessions.difficulty")}</Menu.GroupLabel>
                  <Menu.RadioGroup
                    value={form.difficulty}
                    onChange={(value) => {
                      const difficulty = jiraSessionDifficulties.find((difficulty) => difficulty === value)
                      if (difficulty) setForm("difficulty", difficulty)
                    }}
                  >
                    <For each={jiraSessionDifficulties}>
                      {(difficulty) => (
                        <Menu.RadioItem value={difficulty} closeOnSelect class="!h-auto !py-2">
                          <span class="flex min-w-0 flex-col gap-0.5">
                            <span>{props.t(`boc.jira.sessions.difficulty.${difficulty}`)}</span>
                            <bdi dir="ltr" class="truncate text-[12px] text-v2-text-text-faint">
                              {form.models[difficulty].model}
                            </bdi>
                          </span>
                        </Menu.RadioItem>
                      )}
                    </For>
                  </Menu.RadioGroup>
                </Menu.Group>
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </SplitButton>
        <details class="text-[12px] leading-[var(--line-height-compact)]">
          <summary class="cursor-pointer text-v2-text-text-muted">{props.t("boc.jira.sessions.instructions")}</summary>
          <JiraSessionInstructionFields
            t={props.t}
            value={form}
            disabled={disabled()}
            onChange={(field, value) => setForm(field, value)}
          />
        </details>
        <Show when={!preferences.loading && !target()}>
          <p role="alert">{props.t("boc.jira.sessions.projectRequired")}</p>
          <Show when={!preferences()}>
            <Button size="small" variant="ghost-muted" onClick={() => void retryProject()}>
              {props.t("boc.jira.board.refresh")}
            </Button>
          </Show>
        </Show>
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
              class="!h-auto !w-full !min-w-0 !justify-start !py-2 !whitespace-normal"
              size="small"
              variant="ghost-muted"
              onClick={() => {
                if (!link.sessionID) return
                setForm("error", "")
                void host.sessions
                  ?.open(link.server, link.sessionID)
                  .then(() => props.onNavigate?.())
                  .catch(() => setForm("error", props.t("boc.jira.sessions.unavailable")))
              }}
            >
              <Icon name="speech-bubble" class="shrink-0" />
              <span class="flex min-w-0 flex-1 flex-col gap-1 text-start">
                <bdi dir="auto" class="truncate">
                  {link.title}
                </bdi>
                <span class="text-[12px] text-v2-text-text-faint">
                  {new Date(link.createdAt).toLocaleString(host.locale())}
                </span>
              </span>
            </Button>
          )}
        </For>
      </section>
    </Show>
  )
}
