import { Badge } from "@opencode/ui/badge"
import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Menu } from "@opencode/ui/menu"
import { Tooltip } from "@opencode/ui/tooltip"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import { isBlockingDeploymentOperation, type DeploymentOperationState } from "../domain/operations"
import { formatDeploymentAge, type DeploymentSystem } from "../domain/systems"
import { DeploymentRowDetails } from "./row-details"
import { autoSyncOffMenuVisible, redeployMenuVisible } from "./action-visibility"
import type { DeploymentCacheRunSnapshot, DeploymentSettings } from "../rpcs"
import { DeploymentProgress } from "./operation-progress"
import { deploymentSiteUrl } from "../domain/site-url"
import { DEPLOYMENT_GITHUB_REPOSITORY } from "../domain/github"

export function DeploymentSystemsTable(props: {
  t: BocTranslator
  systems: readonly DeploymentSystem[]
  jiraTicketStatuses?: Readonly<Record<string, string>>
  expanded?: string
  onToggleDetails: (environment: string) => void
  onDeploy?: (system: DeploymentSystem) => void
  onReset?: (system: DeploymentSystem) => void
  onRedeploy?: (system: DeploymentSystem) => void
  onTurnAutoSyncOff?: (system: DeploymentSystem) => void
  onClearCache?: (system: DeploymentSystem) => void
  onOpenSsh?: (system: DeploymentSystem) => void
  cacheRuns?: Record<string, DeploymentCacheRunSnapshot | undefined>
  now: number
  openExternal: (url: string) => void
  jiraOrigin?: string
  settings?: DeploymentSettings
}) {
  return (
    <div data-boc-deployments-table class="min-h-0 flex-1 overflow-auto">
      <table class="w-full border-separate border-spacing-0 text-left text-[13px] leading-[var(--line-height-compact)]">
        <caption class="sr-only">{props.t("boc.deployments.table.caption")}</caption>
        <thead class="sticky top-0 z-[1] bg-v2-background-bg-base text-[11px] uppercase tracking-[0.04em] text-v2-text-text-muted">
          <tr>
            <ColumnHeader column="system" label={props.t("boc.deployments.table.system")} />
            <ColumnHeader column="branch" label={props.t("boc.deployments.table.branch")} />
            <ColumnHeader column="ticket" label={props.t("boc.deployments.table.ticket")} />
            <ColumnHeader column="ticket-status" label={props.t("boc.deployments.table.ticketStatus")} />
            <ColumnHeader column="sync" label={props.t("boc.deployments.table.sync")} />
            <ColumnHeader column="health" label={props.t("boc.deployments.table.health")} />
            <ColumnHeader column="age" label={props.t("boc.deployments.table.age")} />
            <ColumnHeader column="auto-sync" label={props.t("boc.deployments.table.autoSync")} />
            <ColumnHeader column="state" label={props.t("boc.deployments.table.state")} />
            <ColumnHeader column="actions" label={props.t("boc.deployments.table.actions")} align="right" />
          </tr>
        </thead>
        <tbody>
          <For each={props.systems}>
            {(system) => {
              const expanded = () => props.expanded === system.environment
              const ticketStatus = () => props.jiraTicketStatuses?.[system.ticketKey?.toUpperCase() ?? ""]
              return (
                <>
                  <tr class="group h-11 bg-v2-background-bg-base hover:bg-v2-background-bg-layer-01">
                    <td
                      data-deployment-column="system"
                      class="border-b border-v2-border-border-muted pl-2 pr-3 [font-weight:530]"
                    >
                      <span class="flex items-center gap-1">
                        <IconButton
                          type="button"
                          variant="ghost-muted"
                          size="small"
                          class="shrink-0"
                          aria-expanded={expanded()}
                          aria-controls={`deployment-details-${system.environment}`}
                          aria-label={props.t(
                            expanded() ? "boc.deployments.details.close" : "boc.deployments.details.open",
                            {
                              system: system.name,
                            },
                          )}
                          icon={<Icon name={expanded() ? "chevron-down" : "chevron-right"} />}
                          onClick={() => props.onToggleDetails(system.environment)}
                        />
                        <DeploymentLink
                          href={deploymentSiteUrl(system.environment, props.settings)}
                          text={system.name}
                          class={`${availabilityTextTone(system.availability)} whitespace-nowrap tabular-nums`}
                          openExternal={props.openExternal}
                        />
                      </span>
                    </td>
                    <td data-deployment-column="branch" class="border-b border-v2-border-border-muted px-3">
                      <DeploymentLink
                        href={
                          system.branch
                            ? `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/tree/${encodeURIComponent(system.branch)}`
                            : undefined
                        }
                        text={system.branch ?? "—"}
                        class="block max-w-[22rem] truncate font-mono text-[12px]"
                        openExternal={props.openExternal}
                      />
                    </td>
                    <td
                      data-deployment-column="ticket"
                      class="border-b border-v2-border-border-muted px-3 font-mono text-[12px]"
                    >
                      <DeploymentLink
                        href={
                          system.ticketKey && props.jiraOrigin
                            ? `${props.jiraOrigin}/browse/${encodeURIComponent(system.ticketKey)}`
                            : undefined
                        }
                        text={system.ticketKey ?? "—"}
                        openExternal={props.openExternal}
                      />
                    </td>
                    <td data-deployment-column="ticket-status" class="border-b border-v2-border-border-muted px-3">
                      <StatusText label={ticketStatus() ?? "—"} tone={jiraTicketStatusTone(ticketStatus())} />
                    </td>
                    <td data-deployment-column="sync" class="border-b border-v2-border-border-muted px-3">
                      <StatusText
                        label={props.t(`boc.deployments.sync.${system.sync}`)}
                        icon={statusIcon(syncTone(system.sync))}
                        tone={syncTone(system.sync)}
                      />
                    </td>
                    <td data-deployment-column="health" class="border-b border-v2-border-border-muted px-3">
                      <StatusText
                        label={props.t(`boc.deployments.health.${system.health}`)}
                        icon={statusIcon(healthTone(system.health))}
                        tone={healthTone(system.health)}
                      />
                    </td>
                    <td
                      data-deployment-column="age"
                      class="border-b border-v2-border-border-muted px-3 tabular-nums text-v2-text-text-muted"
                    >
                      {formatDeploymentAge(system.ageSeconds) ?? "—"}
                    </td>
                    <td data-deployment-column="auto-sync" class="border-b border-v2-border-border-muted px-3">
                      {props.t(`boc.deployments.autoSync.${system.autoSync}`)}
                    </td>
                    <td data-deployment-column="state" class="border-b border-v2-border-border-muted px-3">
                      <SystemState t={props.t} system={system} />
                      <Show when={system.operation}>
                        {(operation) => <DeploymentProgress t={props.t} operation={operation()} now={props.now} />}
                      </Show>
                    </td>
                    <td data-deployment-column="actions" class="border-b border-v2-border-border-muted pl-3 pr-4">
                      <SystemActions
                        t={props.t}
                        system={system}
                        onDeploy={props.onDeploy}
                        onReset={props.onReset}
                        onRedeploy={props.onRedeploy}
                        onTurnAutoSyncOff={props.onTurnAutoSyncOff}
                        onClearCache={props.onClearCache}
                        onOpenSsh={props.onOpenSsh}
                        cacheRun={props.cacheRuns?.[system.environment]}
                      />
                    </td>
                  </tr>
                  <Show when={expanded()}>
                    <tr>
                      <td colspan="10" class="border-b border-v2-border-border-muted p-0">
                        <DeploymentRowDetails
                          t={props.t}
                          system={system}
                          ticketStatus={ticketStatus()}
                          openExternal={props.openExternal}
                        />
                      </td>
                    </tr>
                  </Show>
                </>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function DeploymentLink(props: { href?: string; text: string; class?: string; openExternal: (url: string) => void }) {
  return (
    <Show
      when={props.href}
      fallback={
        <span class={props.class} title={props.text}>
          <bdi dir="ltr">{props.text}</bdi>
        </span>
      }
    >
      {(href) => (
        <a
          href={href()}
          target="_blank"
          rel="noreferrer"
          class={`deployment-system-link ${props.class ?? ""}`}
          title={props.text}
          onClick={(event) => {
            event.preventDefault()
            props.openExternal(href())
          }}
        >
          <bdi dir="ltr">{props.text}</bdi>
        </a>
      )}
    </Show>
  )
}

export function DeploymentSkeleton(props: { t: BocTranslator }) {
  return (
    <div data-boc-deployments-table class="min-h-0 flex-1 overflow-hidden" role="status" aria-live="polite">
      <span class="sr-only">{props.t("boc.deployments.loading")}</span>
      <table aria-hidden="true" class="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            <ColumnHeader column="system" label={props.t("boc.deployments.table.system")} />
            <ColumnHeader column="branch" label={props.t("boc.deployments.table.branch")} />
            <ColumnHeader column="ticket" label={props.t("boc.deployments.table.ticket")} />
            <ColumnHeader column="ticket-status" label={props.t("boc.deployments.table.ticketStatus")} />
            <ColumnHeader column="sync" label={props.t("boc.deployments.table.sync")} />
            <ColumnHeader column="health" label={props.t("boc.deployments.table.health")} />
            <ColumnHeader column="age" label={props.t("boc.deployments.table.age")} />
            <ColumnHeader column="auto-sync" label={props.t("boc.deployments.table.autoSync")} />
            <ColumnHeader column="state" label={props.t("boc.deployments.table.state")} />
            <ColumnHeader column="actions" label={props.t("boc.deployments.table.actions")} />
          </tr>
        </thead>
        <tbody>
          <For each={[0, 1, 2, 3, 4, 5]}>
            {() => (
              <tr class="h-11">
                <For
                  each={[
                    "system",
                    "branch",
                    "ticket",
                    "ticket-status",
                    "sync",
                    "health",
                    "age",
                    "auto-sync",
                    "state",
                    "actions",
                  ]}
                >
                  {(column) => (
                    <td data-deployment-column={column} class="border-b border-v2-border-border-muted px-3">
                      <span class="block h-2.5 w-3/4 animate-pulse rounded-sm bg-v2-background-bg-layer-02 motion-reduce:animate-none" />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function operationLabel(t: BocTranslator, state: DeploymentOperationState) {
  return t(`boc.deployments.operation.${state}`)
}

function ColumnHeader(props: { column: string; label: string; align?: "right" }) {
  return (
    <th
      scope="col"
      data-deployment-column={props.column}
      class="h-8 border-b border-v2-border-border-muted px-3 [font-weight:530]"
      classList={{ "text-right": props.align === "right" }}
    >
      {props.label}
    </th>
  )
}

function SystemState(props: { t: BocTranslator; system: DeploymentSystem }) {
  if (props.system.operation) {
    return (
      <Badge class={operationTone(props.system.operation.state)} data-high-contrast>
        {operationLabel(props.t, props.system.operation.state)}
      </Badge>
    )
  }
  return (
    <Badge classList={availabilityBadgeClasses(props.system.availability)}>
      {props.t(`boc.deployments.availability.${props.system.availability}`)}
    </Badge>
  )
}

function SystemActions(props: {
  t: BocTranslator
  system: DeploymentSystem
  onDeploy?: (system: DeploymentSystem) => void
  onReset?: (system: DeploymentSystem) => void
  onRedeploy?: (system: DeploymentSystem) => void
  onTurnAutoSyncOff?: (system: DeploymentSystem) => void
  onClearCache?: (system: DeploymentSystem) => void
  onOpenSsh?: (system: DeploymentSystem) => void
  cacheRun?: DeploymentCacheRunSnapshot
}) {
  const canDeploy = () => props.system.allowedActions?.includes("deploy") === true
  const canReset = () => props.system.allowedActions?.includes("reset") === true
  const canRedeploy = () => props.system.allowedActions?.includes("redeploy") === true
  const blocked = () =>
    props.system.operation !== undefined && isBlockingDeploymentOperation(props.system.operation.state)
  const deployReason = () => {
    if (blocked()) return props.t("boc.deployments.action.reason.active")
    if (!canDeploy()) return props.t("boc.deployments.action.reason.readiness")
    return undefined
  }

  return (
    <div class="flex items-center justify-end gap-1">
      <Tooltip
        value={deployReason() ?? props.t("boc.deployments.action.deployTo", { system: props.system.name })}
        placement="bottom"
      >
        <span>
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled={!canDeploy()}
            aria-label={props.t("boc.deployments.action.deployTo", { system: props.system.name })}
            onClick={() => props.onDeploy?.(props.system)}
          >
            {props.t("boc.deployments.action.deploy")}
          </Button>
        </span>
      </Tooltip>
      <Menu placement="bottom-end" gutter={4}>
        <Menu.Trigger
          as={IconButton}
          type="button"
          variant="ghost-muted"
          size="small"
          aria-label={props.t("boc.deployments.action.more", { system: props.system.name })}
          icon={<Icon name="outline-dots" />}
        />
        <Menu.Portal>
          <Menu.Content>
            <Menu.Item
              disabled={!canReset()}
              badge={canReset() ? undefined : props.t("boc.deployments.action.unavailable.short")}
              onSelect={() => props.onReset?.(props.system)}
            >
              {props.t("boc.deployments.action.reset")}
            </Menu.Item>
            <Show when={redeployMenuVisible(props.system)}>
              <Menu.Item
                disabled={!canRedeploy()}
                badge={canRedeploy() ? undefined : props.t("boc.deployments.action.unavailable.short")}
                onSelect={() => props.onRedeploy?.(props.system)}
              >
                {props.t("boc.deployments.action.redeploy")}
              </Menu.Item>
            </Show>
            <Menu.Separator />
            <Show when={autoSyncOffMenuVisible(props.system)}>
              <Menu.Item
                disabled={blocked() || !props.system.allowedActions?.includes("auto-sync")}
                badge={
                  blocked() || !props.system.allowedActions?.includes("auto-sync")
                    ? props.t("boc.deployments.action.unavailable.short")
                    : undefined
                }
                onSelect={() => props.onTurnAutoSyncOff?.(props.system)}
              >
                {props.t("boc.deployments.action.autoSync.off")}
              </Menu.Item>
            </Show>
            <Menu.Item
              disabled={!props.system.allowedActions?.includes("clear-cache") && !props.cacheRun}
              badge={props.cacheRun ? props.t(`boc.deployments.cache.state.${props.cacheRun.state}`) : undefined}
              onSelect={() => props.onClearCache?.(props.system)}
            >
              {props.t("boc.deployments.action.clearCache")}
            </Menu.Item>
            <Menu.Item
              disabled={!props.onOpenSsh || !props.system.allowedActions?.includes("ssh")}
              badge={
                props.onOpenSsh && props.system.allowedActions?.includes("ssh")
                  ? undefined
                  : props.t("boc.deployments.action.unavailable.short")
              }
              onSelect={() => props.onOpenSsh?.(props.system)}
            >
              {props.t("boc.deployments.action.openSsh")}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </div>
  )
}

type StatusTone = "success" | "info" | "warning" | "danger" | "muted"
type StatusIcon = "circle-check" | "warning" | "circle-exclamation" | "info"

function StatusText(props: {
  label: string
  tone: StatusTone
  icon?: StatusIcon
}) {
  const toneClasses = {
    "text-v2-state-fg-success": props.tone === "success",
    "text-v2-state-fg-info": props.tone === "info",
    "text-v2-state-fg-warning": props.tone === "warning",
    "text-v2-state-fg-danger": props.tone === "danger",
    "text-v2-text-text-muted": props.tone === "muted",
  }
  if (!props.icon) {
    return (
      <span class="inline-flex items-center gap-1" classList={toneClasses}>
        {props.label}
      </span>
    )
  }
  return (
    <Tooltip value={props.label} placement="top" class="inline-flex">
      <span class="inline-flex items-center" classList={toneClasses}>
        <Icon name={props.icon} size="small" aria-hidden="true" />
        <span class="sr-only">{props.label}</span>
      </span>
    </Tooltip>
  )
}

function statusIcon(tone: StatusTone): StatusIcon {
  if (tone === "success") return "circle-check"
  if (tone === "info") return "info"
  if (tone === "warning") return "warning"
  if (tone === "danger") return "circle-exclamation"
  return "info"
}

function syncTone(sync: DeploymentSystem["sync"]): StatusTone {
  if (sync === "synced") return "success"
  if (sync === "out-of-sync") return "warning"
  return "muted"
}

export function jiraTicketStatusTone(status?: string): StatusTone {
  const normalized = status?.trim().toLowerCase()
  if (!normalized || normalized === "n/a") return "muted"
  if (["done", "finished", "fertig", "erledigt", "awaiting go live"].includes(normalized)) return "info"
  if (["closed", "resolved"].includes(normalized)) return "success"
  if (["blocked", "rejected", "cancelled", "canceled"].includes(normalized)) return "danger"
  return "warning"
}

function healthTone(health: DeploymentSystem["health"]): StatusTone {
  if (health === "healthy") return "success"
  if (health === "progressing" || health === "suspended") return "warning"
  if (health === "degraded" || health === "missing") return "danger"
  return "muted"
}

function availabilityTextTone(availability: DeploymentSystem["availability"]) {
  if (availability === "free") return "text-v2-state-fg-success"
  if (availability === "occupied") return "text-v2-state-fg-warning"
  return "text-v2-text-text-muted"
}

function availabilityBadgeClasses(availability: DeploymentSystem["availability"]) {
  return {
    "text-v2-state-fg-success": availability === "free",
    "bg-v2-state-bg-success": availability === "free",
    "border-v2-state-border-success": availability === "free",
    "text-v2-state-fg-warning": availability === "occupied",
    "bg-v2-state-bg-warning": availability === "occupied",
    "border-v2-state-border-warning": availability === "occupied",
  }
}

function operationTone(state: DeploymentOperationState) {
  if (state === "success") return "text-v2-state-fg-success"
  if (state === "failure" || state === "timed-out") return "text-v2-state-fg-danger"
  if (state === "in-progress" || state === "dispatching" || state === "queued") return "text-v2-state-fg-warning"
  return "text-v2-text-text-muted"
}
