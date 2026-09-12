import { Avatar } from "@opencode/ui/avatar"
import { Button } from "@opencode/ui/button"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import { JIRA_COMMENT_PAGE_SIZE, mergeJiraComments, type JiraCommentPage } from "../domain/issue"
import type { JiraConnectionFailure } from "../rpcs"
import { JiraMarkdown } from "./markdown"
import { createJiraResource, type JiraCollaborationApi } from "./resource"
import { JiraSection } from "./section"
import { jiraConnectionErrorKey } from "./status"
import { jiraRelativeTime } from "./time"

export function JiraComments(props: {
  api: JiraCollaborationApi
  issueKey: string
  t: BocTranslator
  locale: string
  online: boolean
  onOpenExternal: (url: string) => void
}) {
  const resource = createJiraResource<JiraCommentPage, JiraConnectionFailure>({ api: props.api, resource: "comments" })
  const [pagination, setPagination] = createStore({ loading: false })
  let history: HTMLDivElement | undefined

  async function load(older = false) {
    if (!props.online || resource.state.phase === "loading") return
    const startAt = older ? resource.state.data?.nextStartAt : 0
    if (startAt === null || startAt === undefined) return
    setPagination("loading", older)
    await resource.load(
      async (requestId) => {
        const result = await props.api.listComments({ requestId, issueKey: props.issueKey, startAt })
        if (!result.ok) return { ok: false, failure: result }
        // Capture after the request resolves: reading during a slow request must not move the reader back.
        const scroller = history?.closest<HTMLElement>("[data-jira-scroll]")
        const anchor = older
          ? [...(history?.querySelectorAll<HTMLElement>("[data-comment]") ?? [])].find(
              (row) => row.getBoundingClientRect().bottom > (scroller?.getBoundingClientRect().top ?? 0),
            )
          : undefined
        const top = anchor?.getBoundingClientRect().top
        const value = {
          ...result.page,
          comments: older
            ? mergeJiraComments(result.page.comments, resource.state.data?.comments ?? [])
            : result.page.comments,
        }
        if (anchor && scroller && top !== undefined)
          requestAnimationFrame(() => {
            if (anchor.isConnected) scroller.scrollTop += anchor.getBoundingClientRect().top - top
          })
        return { ok: true, value }
      },
      { ok: false, category: "network" },
    )
    setPagination("loading", false)
  }

  onMount(() => void load())
  return (
    <JiraSection
      t={props.t}
      title={props.t("boc.jira.comments.title")}
      count={resource.state.data ? props.t.plural("boc.jira.comments.count", resource.state.data.total) : undefined}
      online={props.online}
      loading={resource.state.phase === "loading"}
      onRefresh={() => void load()}
    >
      <Show when={resource.state.failure}>
        {(failure) => (
          <div role="alert" class="flex flex-col gap-2 text-v2-state-fg-danger">
            <p>
              {props.t("boc.jira.comments.failed")} {props.t(jiraConnectionErrorKey[failure().category])}
            </p>
            <Show when={resource.state.data}>
              <p class="text-v2-text-text-muted">{props.t("boc.jira.collaboration.stale")}</p>
            </Show>
            <Button
              class="self-start"
              variant="outline"
              size="small"
              disabled={!props.online}
              onClick={() => void load()}
            >
              {props.t("boc.jira.collaboration.retry")}
            </Button>
          </div>
        )}
      </Show>
      <Show when={!resource.state.data && resource.state.phase === "loading"}>
        <div class="flex min-h-28 items-center justify-center" aria-label={props.t("boc.jira.collaboration.loading")}>
          <Show when={resource.state.showLoader}>
            <Loader />
          </Show>
        </div>
      </Show>
      <Show when={(resource.state.data?.total ?? 0) > JIRA_COMMENT_PAGE_SIZE}>
        <Button
          variant="ghost-muted"
          size="small"
          class="self-start"
          disabled={!props.online}
          aria-disabled={resource.state.phase === "loading" || resource.state.data?.nextStartAt === null}
          onClick={() => void load(true)}
        >
          {props.t("boc.jira.comments.older")}
          <Show when={pagination.loading}>
            <Loader class="size-3" />
          </Show>
        </Button>
      </Show>
      <div ref={history} class="flex flex-col gap-5 [overflow-anchor:none]">
        <For each={resource.state.data?.comments}>
          {(comment) => (
            <article data-comment={comment.id} class="flex min-w-0 gap-2.5">
              <Avatar
                size="small"
                src={comment.author?.avatarUrl}
                fallback={comment.author?.displayName ?? props.t("boc.jira.collaboration.unknownAuthor")}
              />
              <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  <bdi dir="auto" class="text-v2-text-text-base [font-weight:530]">
                    {comment.author?.displayName ?? props.t("boc.jira.collaboration.unknownAuthor")}
                  </bdi>
                  <Tooltip value={new Date(comment.createdAt).toLocaleString(props.locale)}>
                    <time dateTime={comment.createdAt} class="text-v2-text-text-faint">
                      {jiraRelativeTime(comment.createdAt, props.locale)}
                    </time>
                  </Tooltip>
                  <Show when={comment.createdAt !== comment.updatedAt}>
                    <Tooltip value={new Date(comment.updatedAt).toLocaleString(props.locale)}>
                      <span class="text-v2-text-text-faint">{props.t("boc.jira.comments.edited")}</span>
                    </Tooltip>
                  </Show>
                </div>
                <JiraMarkdown markdown={comment.body} onOpenExternal={props.onOpenExternal} />
              </div>
            </article>
          )}
        </For>
      </div>
      <Show when={resource.state.data?.comments.length === 0}>
        <p class="text-v2-text-text-muted">{props.t("boc.jira.comments.empty")}</p>
      </Show>
      <p role="status" aria-live="polite" class="sr-only">
        {resource.state.phase === "ready" && resource.state.data
          ? props.t.plural("boc.jira.comments.count", resource.state.data.total)
          : ""}
      </p>
    </JiraSection>
  )
}
