import { IconButton } from "@opencode/ui/icon-button"
import { Icon } from "@opencode/ui/icon"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import type { JiraBranchesResult } from "../rpcs"
import type { JiraPullRequestFailure } from "../domain/pull-request"
import { createJiraResource, type JiraCollaborationApi } from "./resource"
import { JiraSection } from "./section"

export function JiraBranches(props: {
  api: JiraCollaborationApi
  issueKey: string
  online: boolean
  t: BocTranslator
  onOpenExternal: (url: string) => void
  onDeploy?: (branch: string) => void
}) {
  const [copy, setCopy] = createStore({ branch: "", failed: false })
  const copyBranch = (name: string) => {
    setCopy({ branch: "", failed: false })
    void navigator.clipboard.writeText(name).then(
      () => setCopy("branch", name),
      () => setCopy("failed", true),
    )
  }
  const resource = createJiraResource<Extract<JiraBranchesResult, { ok: true }>, JiraPullRequestFailure>({
    api: props.api,
    resource: "branches",
  })
  const load = () => {
    if (!props.online || resource.state.phase === "loading") return
    return resource.load(
      async (requestId) => {
        const result = await props.api.listBranches({ issueKey: props.issueKey, requestId })
        return result.ok ? { ok: true, value: result } : { ok: false, failure: result }
      },
      { ok: false, category: "network" },
    )
  }
  onMount(() => void load())
  return (
    <JiraSection
      t={props.t}
      title={props.t("boc.jira.ticket.branches")}
      loading={resource.state.phase === "loading"}
      online={props.online}
      onRefresh={() => void load()}
    >
      <Show when={resource.state.failure}>
        {(failure) => (
          <p role="alert" class="text-v2-state-fg-danger">
            {props.t(`boc.jira.pr.error.${failure().category}`)}
          </p>
        )}
      </Show>
      <For each={resource.state.data?.branches}>
        {(branch) => (
          <div class="flex min-h-8 min-w-0 items-center gap-2">
            <bdi dir="ltr" class="min-w-0 flex-1 truncate font-mono text-[12px]" title={branch.name}>
              {branch.name}
            </bdi>
            <Tooltip
              value={props.t(copy.branch === branch.name ? "boc.jira.ticket.copied" : "boc.jira.ticket.branches.copy", {
                name: branch.name,
              })}
            >
              <IconButton
                size="small"
                variant="neutral"
                icon={<Icon name={copy.branch === branch.name ? "check" : "copy"} />}
                aria-label={props.t("boc.jira.ticket.branches.copy", { name: branch.name })}
                onClick={() => copyBranch(branch.name)}
              />
            </Tooltip>
            <Tooltip value={props.t("boc.jira.ticket.branches.open", { name: branch.name })}>
              <IconButton
                size="small"
                variant="neutral"
                icon={<Icon name="github" />}
                aria-label={props.t("boc.jira.ticket.branches.open", { name: branch.name })}
                onClick={() => props.onOpenExternal(branch.url)}
              />
            </Tooltip>
            <Show when={props.onDeploy}>
              <Tooltip value={props.t("boc.jira.ticket.branches.deploy", { name: branch.name })}>
                <IconButton
                  size="small"
                  variant="neutral"
                  icon={<Icon name="cloud-upload" />}
                  aria-label={props.t("boc.jira.ticket.branches.deploy", { name: branch.name })}
                  disabled={!props.online}
                  onClick={() => props.onDeploy?.(branch.name)}
                />
              </Tooltip>
            </Show>
          </div>
        )}
      </For>
      <Show when={copy.failed}>
        <p role="alert" class="text-v2-state-fg-danger">
          {props.t("boc.jira.ticket.branches.copyFailed")}
        </p>
      </Show>
      <Show when={resource.state.data?.branches.length === 0}>
        <p class="text-[12px] text-v2-text-text-faint">{props.t("boc.jira.ticket.branches.empty")}</p>
      </Show>
      <Show when={resource.state.data?.truncated}>
        <p class="text-[12px] text-v2-text-text-muted">{props.t("boc.jira.ticket.branches.truncated")}</p>
      </Show>
    </JiraSection>
  )
}
