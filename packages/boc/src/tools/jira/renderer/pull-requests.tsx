import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { createResource, For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useBocDesktop } from "../../../renderer/desktop"
import { useBocHost } from "../../../renderer/host"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail } from "../domain/issue"
import type { JiraPullRequest, JiraPullRequestFailure } from "../domain/pull-request"
import { jiraPullRequestReviewPrompt, jiraSessionModel } from "../domain/sessions"
import type { JiraPullRequestsResult } from "../rpcs"
import { createJiraResource, type JiraCollaborationApi } from "./resource"
import { JiraSection } from "./section"
import { jiraRelativeTime } from "./time"
import "./pull-requests.css"

export function JiraPullRequests(props: {
  api: JiraCollaborationApi
  issue: JiraIssueDetail
  boardId: number
  issueKey: string
  t: BocTranslator
  locale: string
  online: boolean
  onOpenExternal: (url: string) => void
  onNavigate?: () => void
}) {
  const host = useBocHost()
  const desktop = useBocDesktop()
  const [review, setReview] = createStore({ busy: 0, error: "" })
  const [defaults] = createResource(() => desktop?.jira.getSessionInstructions().catch(() => undefined))
  const [preferences] = createResource(() => desktop?.jira.getPreferences().catch(() => undefined))
  const target = () => preferences()?.projectTargets?.find((item) => item.boardId === props.boardId)
  const reviewDisabled = () =>
    !props.online || review.busy !== 0 || defaults.loading || preferences.loading || !defaults() || !target()
  const reviewHint = () => {
    if (!props.online) return props.t("boc.jira.collaboration.offline")
    if (review.busy) return props.t("boc.jira.pr.startReview.busy")
    if (!defaults.loading && !defaults()) return props.t("boc.jira.sessions.defaults.loadFailed")
    if (!preferences.loading && !target()) return props.t("boc.jira.sessions.projectRequired")
    return props.t("boc.jira.pr.startReview.hint")
  }
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
  async function startReview(request: JiraPullRequest) {
    const sessions = host.sessions
    const instructions = defaults()
    const project = target()
    if (!sessions || !instructions || !project || reviewDisabled()) return
    setReview({ busy: request.number, error: "" })
    await sessions
      .start({
        issueUrl: props.issue.url,
        title: props.t("boc.jira.pr.startReview.title", { number: request.number, title: request.title }),
        prompt: jiraPullRequestReviewPrompt(props.issue, request, instructions.review),
        model: jiraSessionModel(instructions.models.default.model),
        target: project,
      })
      .then(() => props.onNavigate?.())
      .catch((error: unknown) => {
        setReview("error", error instanceof Error ? error.message : props.t("boc.jira.pr.startReview.failed"))
      })
      .finally(() => setReview("busy", 0))
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
              <Show when={host.sessions && desktop}>
                <div class="flex items-center justify-end px-1 pt-1 pb-1">
                  <Tooltip value={reviewHint()}>
                    <span>
                      <Button
                        size="small"
                        variant="neutral"
                        disabled={reviewDisabled()}
                        aria-busy={review.busy === request.number}
                        onClick={() => void startReview(request)}
                      >
                        <Show when={review.busy === request.number}>
                          <Loader class="size-3" />
                        </Show>
                        {props.t("boc.jira.pr.startReview")}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={review.error}>
        <p role="alert" class="text-v2-state-fg-danger">
          {review.error}
        </p>
      </Show>
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
