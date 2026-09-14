import { JiraAvatar, JiraPerson } from "./person"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { List, type ListRef } from "@opencode/ui/list"
import { Loader } from "@opencode/ui/loader"
import { Popover } from "@opencode/ui/popover"
import { TextInput } from "@opencode/ui/text-input"
import { showToast } from "@opencode/ui/toast"
import { createEffect, createMemo, onCleanup, Show, untrack } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraIssueDetail, JiraIssueUser } from "../domain/issue"
import type { JiraConnectionFailure } from "../rpcs"
import type { JiraAssignments } from "./assignments"
import { createJiraResource, type JiraCollaborationApi } from "./resource"
import { jiraConnectionErrorKey } from "./status"
import "./assignee.css"

export function JiraAssignee(props: {
  api: JiraCollaborationApi
  assignments: JiraAssignments
  issue: JiraIssueDetail
  t: BocTranslator
  online: boolean
}) {
  const [picker, setPicker] = createStore({ open: false, query: "", searching: false })
  const resource = createJiraResource<readonly JiraIssueUser[], JiraConnectionFailure>({
    api: props.api,
    resource: "assignees",
  })
  const options = createMemo(() => [
    {
      accountId: null,
      displayName: props.t("boc.jira.board.inspector.unassigned"),
      avatarUrl: undefined,
      emailAddress: undefined,
    },
    ...(resource.state.data ?? []),
  ])
  const mutation = () => props.assignments.state[props.issue.url]
  let list: ListRef | undefined
  let container: HTMLDivElement | undefined
  let focusFrame: number | undefined
  onCleanup(() => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
  })
  const load = async () => {
    if (!props.online || !picker.open) return
    const result = await resource.load(
      async (requestId) => {
        const result = await props.api.searchAssignees({
          requestId,
          issueKey: props.issue.key,
          query: picker.query.trim(),
        })
        return result.ok ? { ok: true, value: result.users } : { ok: false, failure: result }
      },
      { ok: false, category: "network" },
    )
    if (result !== undefined) setPicker("searching", false)
  }
  createEffect(() => {
    const opened = picker.open
    const query = picker.query
    props.online
    untrack(resource.cancel)
    setPicker("searching", opened && props.online)
    if (!opened) return
    const timer = setTimeout(() => void load(), query ? 225 : 0)
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <div ref={container} class="flex min-w-0 flex-col gap-1.5">
      <Popover
        portal={false}
        triggerAs={Button}
        onOpenAutoFocus={(event) => event.preventDefault()}
        open={picker.open}
        onOpenChange={(open) => {
          if (open && (!props.online || mutation()?.pending)) return
          setPicker({ open, query: "" })
          if (focusFrame !== undefined) cancelAnimationFrame(focusFrame)
          if (!open) return
          // Inline popovers can create their focus scope before their content is attached.
          focusFrame = requestAnimationFrame(() => {
            container?.querySelector("input")?.focus({ preventScroll: true })
          })
        }}
        placement="bottom-start"
        title={props.t("boc.jira.assignee.change")}
        class="jira-assignee-picker"
        triggerProps={{
          variant: "ghost-muted",
          size: "small",
          class: "!w-fit !max-w-full self-start !justify-start !px-0",
          disabled: !props.online,
          "aria-disabled": mutation()?.pending,
          "aria-label": props.t("boc.jira.assignee.change"),
        }}
        trigger={
          <>
            <JiraPerson
              avatarUrl={props.issue.assignee?.avatarUrl}
              name={props.issue.assignee?.displayName ?? props.t("boc.jira.board.inspector.unassigned")}
            />
            <Show when={mutation()?.pending} fallback={<Icon name="chevron-down" />}>
              <Loader class="size-3" />
            </Show>
          </>
        }
      >
        <div class="jira-assignee-content">
          <TextInput
            class="!w-full"
            leadingIcon={<Icon name="magnifying-glass" />}
            autocomplete="off"
            spellcheck={false}
            aria-label={props.t("boc.jira.assignee.search")}
            placeholder={props.t("boc.jira.assignee.search")}
            value={picker.query}
            maxLength={255}
            onInput={(event) => setPicker("query", event.currentTarget.value)}
            onKeyDown={(event) => list?.onKeyDown(event)}
          />
          <div
            class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted empty:hidden"
            role="status"
          >
            <Show when={!picker.searching && resource.state.phase === "ready" && resource.state.data?.length === 0}>
              {props.t("boc.jira.assignee.empty")}
            </Show>
          </div>
          <Show when={resource.state.failure}>
            {(failure) => (
              <div role="alert" class="text-[12px] text-v2-state-fg-danger">
                <p>
                  {props.t("boc.jira.assignee.failed")} {props.t(jiraConnectionErrorKey[failure().category])}
                </p>
                <Button size="small" variant="outline" disabled={!props.online} onClick={() => void load()}>
                  {props.t("boc.jira.collaboration.retry")}
                </Button>
              </div>
            )}
          </Show>
          <div class="jira-assignee-options" inert={picker.searching} aria-busy={picker.searching}>
            <List
              ref={(value) => {
                list = value
              }}
              items={options()}
              key={(user) => user.accountId ?? "unassigned"}
              current={options().find((user) => user.accountId === (props.issue.assignee?.accountId ?? null))}
              onSelect={(user) => {
                if (!user || !props.online || mutation()?.pending || picker.searching) return
                const issueKey = props.issue.key
                const issue = props.issue
                setPicker("open", false)
                void props.assignments.assign(issue, user.accountId === null ? null : user).then((result) => {
                  if (result?.ok) showToast({ title: props.t("boc.jira.assignee.success", { issue: issueKey }) })
                })
              }}
            >
              {(user) => (
                <span class="flex min-w-0 flex-1 items-center gap-2 text-start text-[13px] leading-[var(--line-height-compact)]">
                  <JiraAvatar src={user.avatarUrl} fallback={user.displayName} />
                  <span class="min-w-0 flex-1">
                    <bdi dir="auto" class="block truncate" title={user.displayName}>
                      {user.displayName}
                    </bdi>
                    <Show when={user.emailAddress}>
                      <bdi
                        dir="auto"
                        class="block truncate text-[12px] text-v2-text-text-muted"
                        title={user.emailAddress}
                      >
                        {user.emailAddress}
                      </bdi>
                    </Show>
                  </span>
                </span>
              )}
            </List>
          </div>
        </div>
      </Popover>
      <Show when={mutation()?.failure}>
        {(failure) => (
          <p
            role="alert"
            class="text-[12px] leading-[var(--line-height-compact)]"
            classList={{
              "text-v2-state-fg-warning": failure().outcome === "unknown",
              "text-v2-state-fg-danger": failure().outcome === "rejected",
            }}
          >
            {props.t(failure().outcome === "unknown" ? "boc.jira.assignee.unknown" : "boc.jira.assignee.rejected")}{" "}
            {props.t(jiraConnectionErrorKey[failure().category])}
          </p>
        )}
      </Show>
    </div>
  )
}
