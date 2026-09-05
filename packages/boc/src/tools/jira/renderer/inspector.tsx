import { JiraIssueSessions } from "./sessions"
import { Avatar } from "@opencode-ai/ui/avatar"
import { Badge } from "@opencode-ai/ui/badge"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Loader } from "@opencode-ai/ui/loader"
import { createEffect, For, Show, type JSX } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail } from "../domain/board"
import type { JiraConnectionFailure } from "../rpcs"
import { jiraConnectionErrorKey } from "./status"
import { JiraIssueDescription } from "./description"
import { jiraRelativeTime } from "./time"
import { jiraPriorityTone, jiraToneText } from "./tone"

export function JiraIssueInspector(props: {
  t: BocTranslator
  locale: string
  issueKey: string
  issue?: JiraIssueDetail
  loading: boolean
  overlay: boolean
  failure?: JiraConnectionFailure
  onClose: () => void
  onOpenExternal: (url: string) => void
}) {
  let inspector: HTMLElement | undefined
  createEffect(() => {
    props.issueKey
    queueMicrotask(() => inspector?.focus())
  })

  return (
    <aside
      ref={(element) => (inspector = element)}
      id="boc-jira-issue-inspector"
      data-boc-issue-inspector
      role={props.overlay ? "dialog" : "complementary"}
      aria-labelledby="boc-jira-issue-inspector-title"
      tabIndex={-1}
      class="flex min-h-0 flex-col overflow-hidden rounded-[8px] outline-none select-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
      classList={{
        "absolute bottom-3 right-3 top-0 z-10 w-[min(36rem,calc(100%-1.5rem))] bg-v2-background-bg-base shadow-[var(--v2-elevation-floating)]":
          props.overlay,
        "relative w-[36rem] shrink-0 bg-v2-background-bg-layer-01": !props.overlay,
      }}
    >
      <div class="flex h-10 shrink-0 items-center gap-1 pl-4 pr-2">
        <span class="min-w-0 flex-1 truncate text-[12px] leading-[var(--line-height-compact)] tabular-nums text-v2-text-text-muted [font-weight:530]">
          {props.issueKey}
        </span>
        <Show when={props.issue}>
          {(issue) => (
            <Button
              type="button"
              variant="ghost-muted"
              size="small"
              icon="arrow-up-right"
              onClick={() => props.onOpenExternal(issue().url)}
            >
              {props.t("boc.jira.board.openInJira")}
            </Button>
          )}
        </Show>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="small"
          icon={<Icon name="close" />}
          aria-label={props.t("boc.jira.board.inspector.close")}
          onClick={props.onClose}
        />
      </div>

      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 text-[13px] leading-[var(--line-height-compact)]">
        <Show when={props.loading}>
          <div role="status" aria-live="polite" class="flex flex-col gap-3">
            <p
              id="boc-jira-issue-inspector-title"
              class="text-[15px] leading-[var(--line-height-base)] text-v2-text-text-muted"
            >
              {props.t("boc.jira.board.loading")}
            </p>
            <Loader />
          </div>
        </Show>
        <Show when={!props.loading && props.failure}>
          {(failure) => (
            <p id="boc-jira-issue-inspector-title" role="alert" class="text-v2-state-fg-danger">
              {inspectorError(props.t, failure())}
            </p>
          )}
        </Show>
        <Show when={!props.loading && !props.failure && props.issue}>
          {(issue) => (
            <>
              <h2
                id="boc-jira-issue-inspector-title"
                class="text-[15px] leading-[var(--line-height-base)] text-v2-text-text-base [font-weight:530]"
              >
                {issue().summary}
              </h2>

              <dl
                aria-label={props.t("boc.jira.board.inspector.properties")}
                class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2"
              >
                <Property label={props.t("boc.jira.board.inspector.status")}>
                  <Text value={issue().statusName} />
                </Property>
                <Property label={props.t("boc.jira.board.filters.type")}>
                  <Text value={issue().issueTypeName} />
                </Property>
                <Property label={props.t("boc.jira.board.filters.priority")}>
                  <Show when={issue().priorityName} fallback={<Empty />}>
                    {(priority) => (
                      <span class={jiraToneText[jiraPriorityTone(priority())]}>{priority()}</span>
                    )}
                  </Show>
                </Property>
                <Property label={props.t("boc.jira.board.filters.assignee")}>
                  <Show
                    when={issue().assigneeName}
                    fallback={
                      <span class="text-v2-text-text-muted">{props.t("boc.jira.board.inspector.unassigned")}</span>
                    }
                  >
                    {(assignee) => <Person name={assignee()} />}
                  </Show>
                </Property>
                <Property label={props.t("boc.jira.board.inspector.reporter")}>
                  <Show when={issue().reporterName} fallback={<Empty />}>
                    {(reporter) => <Person name={reporter()} />}
                  </Show>
                </Property>
                <Show when={issue().labels.length > 0}>
                  <Property label={props.t("boc.jira.board.inspector.labels")}>
                    <span class="flex flex-wrap gap-1">
                      <For each={issue().labels}>{(label) => <Badge>{label}</Badge>}</For>
                    </span>
                  </Property>
                </Show>
                <Property label={props.t("boc.jira.board.inspector.created")}>
                  <Text value={jiraRelativeTime(issue().createdAt, props.locale)} />
                </Property>
                <Property label={props.t("boc.jira.board.inspector.updated")}>
                  <Text value={jiraRelativeTime(issue().updatedAt, props.locale)} />
                </Property>
              </dl>

              <JiraIssueSessions issue={issue()} t={props.t} />

              <section class="flex flex-col gap-2 border-t border-v2-border-border-muted pt-4">
                <h3 class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:530]">
                  {props.t("boc.jira.board.inspector.description")}
                </h3>
                <Show
                  when={issue().description}
                  fallback={
                    <p class="text-v2-text-text-faint">{props.t("boc.jira.board.inspector.emptyDescription")}</p>
                  }
                >
                  {(description) => (
                    <JiraIssueDescription markdown={description()} onOpenExternal={props.onOpenExternal} />
                  )}
                </Show>
              </section>
            </>
          )}
        </Show>
      </div>
    </aside>
  )
}

function Property(props: { label: string; children: JSX.Element }) {
  return (
    <>
      <dt class="text-v2-text-text-muted">{props.label}</dt>
      <dd class="min-w-0 text-v2-text-text-base">{props.children}</dd>
    </>
  )
}

function Text(props: { value?: string }) {
  return (
    <Show when={props.value} fallback={<Empty />}>
      <span class="block truncate">{props.value}</span>
    </Show>
  )
}

function Person(props: { name: string }) {
  return (
    <span class="flex items-center gap-1.5">
      <Avatar size="small" fallback={props.name} />
      <span class="truncate">{props.name}</span>
    </span>
  )
}

function Empty() {
  return <span class="text-v2-text-text-faint">—</span>
}

function inspectorError(t: BocTranslator, failure: JiraConnectionFailure) {
  if (failure.category === "rate-limit" && failure.retryAfterSeconds !== undefined) {
    return t("boc.jira.connection.error.rate-limit.wait", { seconds: failure.retryAfterSeconds })
  }
  return t(jiraConnectionErrorKey[failure.category])
}
