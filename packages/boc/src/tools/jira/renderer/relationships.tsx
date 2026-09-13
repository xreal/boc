import { Badge } from "@opencode/ui/badge"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail, JiraRelatedIssue } from "../domain/issue"

export function JiraRelationships(props: {
  issue: JiraIssueDetail
  t: BocTranslator
  onNavigate: (key: string) => void
}) {
  const groups = () => [...new Set(props.issue.links.map((link) => link.relationship))]
  return (
    <>
      <Show when={props.issue.subtasks.length}>
        <section class="jira-ticket-section" aria-label={props.t("boc.jira.ticket.subtasks")}>
          <h3>
            {props.t("boc.jira.ticket.subtasks")}{" "}
            <span class="jira-ticket-count">
              {props.t("boc.jira.ticket.completion", {
                completed: props.issue.subtasks.filter((issue) => issue.statusCategory === "done").length,
                total: props.issue.subtasks.length,
              })}
            </span>
          </h3>
          <For each={props.issue.subtasks}>{(issue) => <RelatedRow issue={issue} onNavigate={props.onNavigate} />}</For>
        </section>
      </Show>
      <Show when={props.issue.links.length}>
        <section class="jira-ticket-section" aria-label={props.t("boc.jira.ticket.links")}>
          <h3>
            {props.t("boc.jira.ticket.links")} <span class="jira-ticket-count">{props.issue.links.length}</span>
          </h3>
          <For each={groups()}>
            {(relationship) => (
              <div class="flex flex-col gap-1">
                <h4 class="text-[12px] text-v2-text-text-muted">
                  <bdi dir="auto">{relationship}</bdi>
                </h4>
                <For each={props.issue.links.filter((link) => link.relationship === relationship)}>
                  {(link) => <RelatedRow issue={link.issue} onNavigate={props.onNavigate} />}
                </For>
              </div>
            )}
          </For>
        </section>
      </Show>
    </>
  )
}

function RelatedRow(props: { issue: JiraRelatedIssue; onNavigate: (key: string) => void }) {
  return (
    <button type="button" class="jira-ticket-related" onClick={() => props.onNavigate(props.issue.key)}>
      <span
        class="jira-ticket-status-dot"
        data-done={props.issue.statusCategory === "done"}
        title={props.issue.issueTypeName}
      />
      <bdi dir="ltr" class="shrink-0 text-[12px] text-v2-text-text-muted">
        {props.issue.key}
      </bdi>
      <bdi dir="auto" class="min-w-0 flex-1 truncate">
        {props.issue.summary}
      </bdi>
      <Show when={props.issue.statusName}>
        <Badge>{props.issue.statusName}</Badge>
      </Show>
    </button>
  )
}
