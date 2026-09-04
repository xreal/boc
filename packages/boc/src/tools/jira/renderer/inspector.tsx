import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Loader } from "@opencode-ai/ui/loader"
import { createEffect, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail } from "../domain/board"
import type { JiraConnectionFailure } from "../rpcs"
import { jiraConnectionErrorKey } from "./status"

export function JiraIssueInspector(props: {
  t: BocTranslator
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
      class="flex min-h-0 flex-col overflow-hidden rounded-lg border border-v2-border-border-muted bg-v2-background-bg-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
      classList={{
        "absolute inset-y-2 right-2 z-10 w-[min(22rem,calc(100%-1rem))] shadow-[var(--v2-elevation-floating)]":
          props.overlay,
        "relative w-[22rem] shrink-0": !props.overlay,
      }}
    >
      <div class="flex items-start justify-between gap-2 border-b border-v2-border-border-muted px-3 py-2">
        <div class="min-w-0">
          <Show
            when={props.issue}
            fallback={
              <p
                id="boc-jira-issue-inspector-title"
                class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted"
              >
                {props.t("boc.jira.board.loading")}
              </p>
            }
          >
            {(issue) => (
              <>
                <p class="text-[13px] font-medium leading-[var(--line-height-compact)] text-v2-text-text-muted">
                  {issue().key}
                </p>
                <h2
                  id="boc-jira-issue-inspector-title"
                  class="text-[16px] font-medium leading-[var(--line-height-base)] text-v2-text-text-base"
                >
                  {issue().summary}
                </h2>
              </>
            )}
          </Show>
        </div>
        <IconButton
          type="button"
          variant="ghost"
          icon={<Icon name="close" />}
          aria-label={props.t("boc.jira.board.inspector.close")}
          onClick={props.onClose}
        />
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-[13px] leading-[var(--line-height-compact)]">
        <Show when={props.loading}>
          <div role="status" aria-live="polite" class="flex justify-center py-6">
            <Loader />
          </div>
        </Show>
        <Show when={!props.loading && props.failure}>
          {(failure) => <p class="text-v2-state-fg-danger">{inspectorError(props.t, failure())}</p>}
        </Show>
        <Show when={!props.loading && !props.failure && props.issue}>
          {(issue) => (
            <dl class="flex flex-col gap-3">
              <InspectorField label={props.t("boc.jira.board.filters.type")} value={issue().issueTypeName} />
              <InspectorField label={props.t("boc.jira.board.inspector.status")} value={issue().statusName} />
              <InspectorField label={props.t("boc.jira.board.filters.priority")} value={issue().priorityName} />
              <InspectorField
                label={props.t("boc.jira.board.filters.assignee")}
                value={issue().assigneeName ?? props.t("boc.jira.board.inspector.unassigned")}
              />
              <div>
                <dt class="text-v2-text-text-muted">{props.t("boc.jira.board.inspector.description")}</dt>
                <dd class="mt-1 whitespace-pre-wrap text-v2-text-text-base">
                  {issue().description ?? props.t("boc.jira.board.inspector.emptyDescription")}
                </dd>
              </div>
            </dl>
          )}
        </Show>
      </div>
      <Show when={props.issue}>
        {(issue) => (
          <div class="border-t border-v2-border-border-muted px-3 py-2">
            <Button type="button" variant="outline" size="small" onClick={() => props.onOpenExternal(issue().url)}>
              {props.t("boc.jira.board.openInJira")}
            </Button>
          </div>
        )}
      </Show>
    </aside>
  )
}

function InspectorField(props: { label: string; value?: string }) {
  return (
    <div>
      <dt class="text-v2-text-text-muted">{props.label}</dt>
      <dd class="text-v2-text-text-base">{props.value}</dd>
    </div>
  )
}

function inspectorError(t: BocTranslator, failure: JiraConnectionFailure) {
  if (failure.category === "rate-limit" && failure.retryAfterSeconds !== undefined) {
    return t("boc.jira.connection.error.rate-limit.wait", { seconds: failure.retryAfterSeconds })
  }
  return t(jiraConnectionErrorKey[failure.category])
}
