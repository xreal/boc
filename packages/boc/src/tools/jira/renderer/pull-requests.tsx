import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, onMount, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraPullRequest, JiraPullRequestFailure } from "../domain/pull-request"
import type { JiraPullRequestsResult } from "../rpcs"
import { createJiraResource, type JiraCollaborationApi } from "./resource"
import { JiraSection } from "./section"
import { jiraRelativeTime } from "./time"
import "./pull-requests.css"

export function JiraPullRequests(props: {
  api: JiraCollaborationApi
  issueKey: string
  t: BocTranslator
  locale: string
  online: boolean
  onOpenExternal: (url: string) => void
}) {
  const resource = createJiraResource<Extract<JiraPullRequestsResult, { ok: true }>, JiraPullRequestFailure>({
    api: props.api,
    resource: "pull-requests",
  })
  const load = (refresh = false) => {
    if (!props.online || resource.state.phase === "loading") return
    return resource.load(
      async (requestId) => {
        const result = await props.api.listPullRequests({ requestId, issueKey: props.issueKey, refresh })
        return result.ok ? { ok: true, value: result } : { ok: false, failure: result }
      },
      { ok: false, category: "network" },
    )
  }
  onMount(() => void load())
  return (
    <JiraSection
      t={props.t}
      title={props.t("boc.jira.pr.title")}
      icon={<Icon name="github" class="shrink-0" />}
      count={resource.state.data ? props.t.plural("boc.jira.pr.count", resource.state.data.requests.length) : undefined}
      loading={resource.state.phase === "loading"}
      online={props.online}
      onRefresh={() => void load(true)}
    >
      <Show when={resource.state.failure}>
        {(failure) => (
          <div role="alert" class="flex flex-col gap-2 text-v2-state-fg-danger">
            <p>{props.t(`boc.jira.pr.error.${failure().category}`)}</p>
            <Show when={resource.state.data}>
              <p class="text-v2-text-text-muted">{props.t("boc.jira.collaboration.stale")}</p>
            </Show>
            <Button
              size="small"
              variant="outline"
              class="self-start"
              disabled={!props.online}
              onClick={() => void load(true)}
            >
              {props.t("boc.jira.collaboration.retry")}
            </Button>
          </div>
        )}
      </Show>
      <Show when={!resource.state.data && resource.state.phase === "loading"}>
        <div class="flex min-h-20 items-center justify-center" aria-label={props.t("boc.jira.collaboration.loading")}>
          <Show when={resource.state.showLoader}>
            <Loader />
          </Show>
        </div>
      </Show>
      <div class="flex flex-col gap-1">
        <For each={resource.state.data?.requests}>
          {(request) => (
            <div class="jira-pr">
              <Button
                variant="ghost-muted"
                class="!h-auto !w-full !justify-start !whitespace-normal !px-1 !py-1.5 text-start"
                aria-label={props.t("boc.jira.pr.openLabel", {
                  number: request.number,
                  title: request.title,
                  state: stateLabel(props.t, request),
                })}
                onClick={() => props.onOpenExternal(request.url)}
              >
                <span class="flex min-w-0 flex-1 flex-col gap-1 text-[13px] leading-[var(--line-height-compact)]">
                  <span class="flex items-center gap-2">
                    <bdi dir="auto" class="min-w-0 flex-1 truncate text-v2-text-text-base" title={request.title}>
                      {request.title}
                    </bdi>
                    <Icon name="arrow-up-right" class="shrink-0" />
                  </span>
                  <span class="flex min-w-0 items-center gap-1.5 text-[12px] text-v2-text-text-faint">
                    <Tooltip value={stateLabel(props.t, request)}>
                      <span
                        class="jira-pr-state inline-flex shrink-0 items-center gap-1"
                        data-state={request.state === "OPEN" && request.isDraft ? "DRAFT" : request.state}
                      >
                        {stateLabel(props.t, request)}
                      </span>
                    </Tooltip>
                    <bdi dir="auto" class="min-w-0 flex-1 truncate" title={request.author?.login}>
                      {request.author?.login ?? props.t("boc.jira.collaboration.unknownAuthor")}
                    </bdi>
                    <Tooltip value={new Date(request.updatedAt).toLocaleString(props.locale)}>
                      <time class="shrink-0" dateTime={request.updatedAt}>
                        {jiraRelativeTime(request.updatedAt, props.locale)}
                      </time>
                    </Tooltip>
                    <Show when={request.state === "OPEN" && request.reviewDecision}>
                      <Tooltip value={reviewLabel(props.t, request)}>
                        <span class="jira-pr-review inline-flex shrink-0" data-review={request.reviewDecision}>
                          <Icon
                            name={
                              request.reviewDecision === "APPROVED"
                                ? "circle-check"
                                : request.reviewDecision === "CHANGES_REQUESTED"
                                  ? "warning"
                                  : "eye"
                            }
                            size="small"
                          />
                          <span class="sr-only">{reviewLabel(props.t, request)}</span>
                        </span>
                      </Tooltip>
                    </Show>
                    <Tooltip value={request.headRefName}>
                      <span
                        class="jira-pr-state inline-flex shrink-0"
                        data-state={request.state === "OPEN" && request.isDraft ? "DRAFT" : request.state}
                        aria-label={request.headRefName}
                      >
                        <Icon name="branch" size="small" />
                      </span>
                    </Tooltip>
                  </span>
                </span>
              </Button>
              <div class="flex items-center gap-2 px-1 pb-1">
                <Tooltip value={props.t("boc.jira.pr.lightReview.hint")}>
                  <span>
                    <Button size="small" variant="outline" disabled>
                      {props.t("boc.jira.pr.lightReview")}
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip value={props.t("boc.jira.pr.deepReview.hint")}>
                  <span>
                    <Button size="small" variant="outline" disabled>
                      {props.t("boc.jira.pr.deepReview")}
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </div>
          )}
        </For>
      </div>
      <Show when={resource.state.data?.requests.length === 0}>
        <p class="text-v2-text-text-muted">{props.t("boc.jira.pr.empty", { issue: props.issueKey })}</p>
      </Show>
    </JiraSection>
  )
}

function stateLabel(t: BocTranslator, request: JiraPullRequest) {
  return t(
    request.state === "MERGED"
      ? "boc.jira.pr.merged"
      : request.state === "CLOSED"
        ? "boc.jira.pr.closed"
        : request.isDraft
          ? "boc.jira.pr.draft"
          : "boc.jira.pr.open",
  )
}

function reviewLabel(t: BocTranslator, request: JiraPullRequest) {
  return t(
    request.reviewDecision === "APPROVED"
      ? "boc.jira.pr.approved"
      : request.reviewDecision === "CHANGES_REQUESTED"
        ? "boc.jira.pr.changes"
        : "boc.jira.pr.review",
  )
}
