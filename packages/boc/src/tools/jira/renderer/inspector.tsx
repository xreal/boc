import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import { DialogTitle } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { Root, Portal, Overlay } from "@kobalte/core/dialog"
import { JiraDialog } from "./dialog"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { createEffect, For, on, onCleanup, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import { useBocHost } from "../../../renderer/host"
import type { JiraIssueDetail } from "../domain/issue"
import type { JiraConnectionFailure } from "../rpcs"
import type { DeploymentSystem } from "../../deployments/domain/systems"
import { jiraConnectionErrorKey } from "./status"
import { JiraIssueDescription } from "./description"
import { JiraIssueTypeIcon } from "./issue-type-icon"
import { JiraIssueDeployments } from "./deployments"
import { JiraIssueSessions } from "./sessions"
import { jiraRelativeTime } from "./time"
import { jiraPriorityTone, jiraToneText } from "./tone"
import { JiraAssignee } from "./assignee"
import type { JiraAssignments } from "./assignments"
import { JiraComments } from "./comments"
import { JiraPullRequests } from "./pull-requests"
import { JiraBranches } from "./branches"
import { JiraPerson } from "./person"
import { JiraRelationships } from "./relationships"
import { JiraAttachments } from "./attachments"
import type { JiraCollaborationApi } from "./resource"
import "./inspector.css"

type JiraIssueInspectorProps = {
  api: JiraCollaborationApi
  assignments: JiraAssignments
  online: boolean
  t: BocTranslator
  locale: string
  issueKey: string
  boardId: number
  issue?: JiraIssueDetail
  loading: boolean
  overlay?: boolean
  failure?: JiraConnectionFailure
  deployedSystems?: readonly DeploymentSystem[]
  onDeploy?: (system?: DeploymentSystem) => void
  onClose: () => void
  returnFocus?: HTMLElement
  onOpenExternal: (url: string) => void
  onNavigate?: (key: string) => void
  onBack?: () => void
  onRetry?: () => void
  scrollPosition?: { document: number; work: number }
  onScroll?: (position: { document: number; work: number }) => void
}

export function JiraIssueDialog(props: JiraIssueInspectorProps) {
  const dialog = useDialog()
  const host = useBocHost()
  return (
    <Root
      open
      modal={!dialog.active}
      onOpenChange={(open) => {
        if (!open && !dialog.active) props.onClose()
      }}
    >
      <Portal>
        <div class="jira-ticket-modal" style={{ "--jira-window-top-inset": `${host.windowTopInset?.() ?? 0}px` }}>
          <Overlay data-component="dialog-overlay" />
          <JiraDialog
            size="x-large"
            containerClass="jira-ticket-dialog"
            class="!overflow-hidden"
            returnFocus={props.returnFocus}
          >
            <div class="sr-only">
              <DialogTitle>{props.issueKey}</DialogTitle>
            </div>
            <JiraIssueInspector {...props} />
          </JiraDialog>
        </div>
      </Portal>
    </Root>
  )
}

export function JiraIssueInspector(props: JiraIssueInspectorProps) {
  let document: HTMLDivElement | undefined
  let work: HTMLDivElement | undefined
  let layout: HTMLDivElement | undefined
  const [copy, setCopy] = createStore({ state: "idle" as "idle" | "copied" | "failed" })
  createEffect(
    on([() => props.issueKey, () => props.loading], () => {
      setCopy("state", "idle")
      if (!props.issue || props.loading) return
      const position = props.scrollPosition
      const frame = requestAnimationFrame(() => {
        if (document) document.scrollTop = position?.document ?? 0
        if (work) work.scrollTop = position?.work ?? 0
        if (layout) layout.scrollTop = position?.document ?? 0
      })
      onCleanup(() => cancelAnimationFrame(frame))
    }),
  )
  const scroll = () =>
    props.onScroll?.({ document: (document?.scrollTop ?? 0) + (layout?.scrollTop ?? 0), work: work?.scrollTop ?? 0 })
  const navigate = (key: string) => props.onNavigate?.(key)
  const copyTitle = () => {
    if (!props.issue) return
    void navigator.clipboard.writeText(`${props.issueKey}: ${props.issue.summary}`).then(
      () => setCopy("state", "copied"),
      () => setCopy("state", "failed"),
    )
  }

  return (
    <section
      id="boc-jira-issue-inspector"
      data-boc-issue-inspector
      class="jira-ticket"
      role={props.overlay ? "dialog" : undefined}
      aria-labelledby="boc-jira-issue-inspector-title"
    >
      <header class="jira-ticket-header">
        <Show when={props.onBack}>
          <IconButton
            icon={<Icon name="arrow-left" />}
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.jira.ticket.back")}
            onClick={() => props.onBack?.()}
          />
        </Show>
        <div class="jira-ticket-identity">
          <div class="jira-ticket-topic">
            <Show when={props.issue}>{(issue) => <JiraIssueTypeIcon issue={issue()} />}</Show>
            <bdi dir="ltr" class="shrink-0 text-[12px] text-v2-text-text-muted">
              {props.issueKey}
            </bdi>
            <Show when={props.issue}>
              {(issue) => (
                <>
                  <bdi dir="auto" class="min-w-0 truncate text-[13px]" title={issue().summary}>
                    {issue().summary}
                  </bdi>
                  <Tooltip
                    value={props.t(copy.state === "copied" ? "boc.jira.ticket.copied" : "boc.jira.ticket.copyTitle")}
                  >
                    <IconButton
                      size="small"
                      variant="ghost-muted"
                      onClick={copyTitle}
                      icon={<Icon name={copy.state === "copied" ? "check" : "copy"} />}
                      aria-label={props.t("boc.jira.ticket.copyTitle")}
                    />
                  </Tooltip>
                </>
              )}
            </Show>
          </div>
        </div>
        <Show when={props.issue}>
          <Button
            size="small"
            class="jira-ticket-external"
            variant="ghost-muted"
            icon="arrow-up-right"
            aria-label={props.t("boc.jira.board.openInJira")}
            onClick={() => props.issue && props.onOpenExternal(props.issue.url)}
          >
            <span>{props.t("boc.jira.board.openInJira")}</span>
          </Button>
        </Show>
        <IconButton
          icon={<Icon name="close" size="large" />}
          variant="ghost-muted"
          size="large"
          aria-label={props.t("boc.jira.board.inspector.close")}
          onClick={props.onClose}
        />
      </header>
      <nav class="jira-ticket-mobile-nav" aria-label={props.t("boc.jira.ticket.work")}>
        <Button variant="ghost-muted" size="small" onClick={() => document?.scrollIntoView({ block: "start" })}>
          {props.t("boc.jira.ticket.showDescription")}
        </Button>
        <Button variant="ghost-muted" size="small" onClick={() => work?.scrollIntoView({ block: "start" })}>
          {props.t("boc.jira.ticket.showWork")}
        </Button>
      </nav>
      <Show when={copy.state === "failed"}>
        <p role="alert" class="px-5 text-v2-state-fg-danger">
          {props.t("boc.jira.ticket.copyFailed")}
        </p>
      </Show>
      <Show when={!props.online}>
        <p role="status" class="px-5 py-2 text-v2-state-fg-warning">
          {props.t("boc.jira.collaboration.offline")}
        </p>
      </Show>
      <Show when={props.loading}>
        <div class="jira-ticket-loading" role="status">
          <Loader />
          <p id="boc-jira-issue-inspector-title">{props.t("boc.jira.board.loading")}</p>
        </div>
      </Show>
      <Show when={!props.loading && props.failure}>
        {(failure) => (
          <div class="jira-ticket-loading" role="alert">
            <p id="boc-jira-issue-inspector-title">{inspectorError(props.t, failure())}</p>
            <Show when={props.onRetry}>
              <Button onClick={() => props.onRetry?.()} disabled={!props.online}>
                {props.t("boc.jira.collaboration.retry")}
              </Button>
            </Show>
          </div>
        )}
      </Show>
      <Show when={props.issueKey} keyed>
        <Show when={!props.loading && !props.failure && props.issue}>
          {(issue) => (
            <div class="jira-ticket-layout" ref={layout} onScroll={scroll}>
              <div class="jira-ticket-document" data-jira-scroll ref={document} onScroll={scroll}>
                <div class="jira-ticket-heading">
                  <h2 id="boc-jira-issue-inspector-title">
                    <bdi dir="auto">{issue().summary}</bdi>
                  </h2>
                  <Show when={issue().parent}>
                    {(parent) => (
                      <button type="button" class="jira-ticket-parent" onClick={() => navigate(parent().key)}>
                        <span>{props.t("boc.jira.ticket.parent")}</span>
                        <bdi dir="ltr">{parent().key}</bdi>
                        <bdi dir="auto" class="truncate">
                          {parent().summary}
                        </bdi>
                      </button>
                    )}
                  </Show>
                </div>
                <section class="jira-ticket-section jira-ticket-description">
                  <h3>{props.t("boc.jira.board.inspector.description")}</h3>
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
                <JiraRelationships issue={issue()} t={props.t} onNavigate={navigate} />
                <JiraAttachments
                  api={props.api}
                  issueKey={props.issueKey}
                  attachments={issue().attachments}
                  online={props.online}
                  t={props.t}
                />
                <JiraComments
                  api={props.api}
                  issueKey={props.issueKey}
                  t={props.t}
                  locale={props.locale}
                  online={props.online}
                  onOpenExternal={props.onOpenExternal}
                />
              </div>
              <div class="jira-ticket-work" ref={work} onScroll={scroll} aria-label={props.t("boc.jira.ticket.work")}>
                <dl class="jira-ticket-properties" aria-label={props.t("boc.jira.board.inspector.properties")}>
                  <Show when={issue().statusName}>
                    <Property label={props.t("boc.jira.board.inspector.status")}>
                      <Badge>{issue().statusName}</Badge>
                    </Property>
                  </Show>
                  <Show when={issue().priorityName || issue().storyPoints !== undefined}>
                    <Property label={props.t("boc.jira.board.filters.priority")}>
                      <span class="jira-ticket-estimate">
                        <Show when={issue().priorityName}>
                          {(priority) => <span class={jiraToneText[jiraPriorityTone(priority())]}>{priority()}</span>}
                        </Show>
                        <Show when={issue().storyPoints !== undefined}>
                          <span
                            class="jira-ticket-points"
                            title={props.t("boc.jira.ticket.storyPoints.label")}
                            aria-label={props.t("boc.jira.ticket.storyPoints.label")}
                          >
                            {props.t("boc.jira.board.storyPoints", { count: issue().storyPoints ?? 0 })}
                          </span>
                        </Show>
                      </span>
                    </Property>
                  </Show>
                  <Property label={props.t("boc.jira.board.filters.assignee")}>
                    <JiraAssignee
                      api={props.api}
                      assignments={props.assignments}
                      issue={issue()}
                      t={props.t}
                      online={props.online}
                    />
                  </Property>
                  <Property label={props.t("boc.jira.board.inspector.reporter")}>
                    <Show when={issue().reporter} fallback={<span class="text-v2-text-text-faint">—</span>}>
                      {(reporter) => <JiraPerson name={reporter().displayName} avatarUrl={reporter().avatarUrl} />}
                    </Show>
                  </Property>
                  <Show when={issue().labels.length}>
                    <Property label={props.t("boc.jira.board.inspector.labels")}>
                      <span class="flex flex-wrap gap-1">
                        <For each={issue().labels}>{(label) => <Badge>{label}</Badge>}</For>
                      </span>
                    </Property>
                  </Show>
                </dl>
                <JiraIssueSessions issue={issue()} boardId={props.boardId} t={props.t} onNavigate={props.onClose} />
                <JiraIssueDeployments
                  onOpenExternal={props.onOpenExternal}
                  t={props.t}
                  locale={props.locale}
                  systems={props.deployedSystems}
                  onDeploy={props.online ? props.onDeploy : undefined}
                />
                <JiraBranches
                  api={props.api}
                  issueKey={props.issueKey}
                  online={props.online}
                  t={props.t}
                  onOpenExternal={props.onOpenExternal}
                />
                <JiraPullRequests
                  api={props.api}
                  issue={issue()}
                  boardId={props.boardId}
                  issueKey={props.issueKey}
                  t={props.t}
                  locale={props.locale}
                  online={props.online}
                  onOpenExternal={props.onOpenExternal}
                  onNavigate={props.onClose}
                />
                <dl class="jira-ticket-properties jira-ticket-dates">
                  <Property label={props.t("boc.jira.board.inspector.created")}>
                    <Timestamp value={issue().createdAt} locale={props.locale} />
                  </Property>
                  <Property label={props.t("boc.jira.board.inspector.updated")}>
                    <Timestamp value={issue().updatedAt} locale={props.locale} />
                  </Property>
                </dl>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </section>
  )
}

function Property(props: { label: string; children: JSX.Element }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </>
  )
}

function Timestamp(props: { value?: string; locale: string }) {
  return (
    <time dateTime={props.value} title={props.value ? new Date(props.value).toLocaleString(props.locale) : undefined}>
      {jiraRelativeTime(props.value, props.locale) ?? "—"}
    </time>
  )
}

function inspectorError(t: BocTranslator, failure: JiraConnectionFailure) {
  if (failure.category === "rate-limit" && failure.retryAfterSeconds !== undefined)
    return t("boc.jira.connection.error.rate-limit.wait", { seconds: failure.retryAfterSeconds })
  return t(jiraConnectionErrorKey[failure.category])
}
