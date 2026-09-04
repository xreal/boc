import { Badge } from "@opencode-ai/ui/badge"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Menu } from "@opencode-ai/ui/menu"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentOperationState } from "../domain/operations"
import { formatDeploymentAge, type DeploymentSystem } from "../domain/systems"
import { DeploymentRowDetails } from "./row-details"

export function DeploymentSystemsTable(props: {
  t: BocTranslator
  systems: readonly DeploymentSystem[]
  expanded?: string
  onToggleDetails: (environment: string) => void
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
                        <span class="whitespace-nowrap tabular-nums">{system.name}</span>
                      </span>
                    </td>
                    <td data-deployment-column="branch" class="border-b border-v2-border-border-muted px-3">
                      <span class="block max-w-[22rem] truncate font-mono text-[12px]" title={system.branch}>
                        {system.branch ?? "—"}
                      </span>
                    </td>
                    <td
                      data-deployment-column="ticket"
                      class="border-b border-v2-border-border-muted px-3 font-mono text-[12px]"
                    >
                      {system.ticketKey ?? "—"}
                    </td>
                    <td data-deployment-column="sync" class="border-b border-v2-border-border-muted px-3">
                      <StatusText
                        label={props.t(`boc.deployments.sync.${system.sync}`)}
                        tone={
                          system.sync === "synced" ? "success" : system.sync === "out-of-sync" ? "warning" : "muted"
                        }
                      />
                    </td>
                    <td data-deployment-column="health" class="border-b border-v2-border-border-muted px-3">
                      <StatusText
                        label={props.t(`boc.deployments.health.${system.health}`)}
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
                    </td>
                    <td data-deployment-column="actions" class="border-b border-v2-border-border-muted pl-3 pr-4">
                      <SystemActions t={props.t} system={system} />
                    </td>
                  </tr>
                  <Show when={expanded()}>
                    <tr>
                      <td colspan="9" class="border-b border-v2-border-border-muted p-0">
                        <DeploymentRowDetails t={props.t} system={system} />
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
                <For each={["system", "branch", "ticket", "sync", "health", "age", "auto-sync", "state", "actions"]}>
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
  return <Badge>{props.t(`boc.deployments.availability.${props.system.availability}`)}</Badge>
}

function SystemActions(props: { t: BocTranslator; system: DeploymentSystem }) {
  return (
    <div class="flex items-center justify-end gap-1">
      <Tooltip value={props.t("boc.deployments.action.unavailable")} placement="bottom">
        <span>
          <Button
            type="button"
            size="small"
            variant="outline"
            disabled
            aria-label={props.t("boc.deployments.action.deployTo", { system: props.system.name })}
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
            <Menu.GroupLabel>{props.t("boc.deployments.action.unavailable")}</Menu.GroupLabel>
            <Menu.Item disabled badge={props.t("boc.deployments.action.unavailable.short")}>
              {props.t("boc.deployments.action.reset")}
            </Menu.Item>
            <Menu.Item disabled badge={props.t("boc.deployments.action.unavailable.short")}>
              {props.t("boc.deployments.action.redeploy")}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item disabled badge={props.t("boc.deployments.action.unavailable.short")}>
              {props.t(
                props.system.autoSync === "off"
                  ? "boc.deployments.action.autoSync.on"
                  : "boc.deployments.action.autoSync.off",
              )}
            </Menu.Item>
            <Menu.Item disabled badge={props.t("boc.deployments.action.unavailable.short")}>
              {props.t("boc.deployments.action.clearCache")}
            </Menu.Item>
            <Menu.Item disabled badge={props.t("boc.deployments.action.unavailable.short")}>
              {props.t("boc.deployments.action.openSsh")}
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
    </div>
  )
}

function StatusText(props: { label: string; tone: "success" | "warning" | "danger" | "muted" }) {
  return (
    <span
      classList={{
        "text-v2-state-fg-success": props.tone === "success",
        "text-v2-state-fg-warning": props.tone === "warning",
        "text-v2-state-fg-danger": props.tone === "danger",
        "text-v2-text-text-muted": props.tone === "muted",
      }}
    >
      {props.label}
    </span>
  )
}

function healthTone(health: DeploymentSystem["health"]): "success" | "warning" | "danger" | "muted" {
  if (health === "healthy") return "success"
  if (health === "progressing" || health === "suspended") return "warning"
  if (health === "degraded" || health === "missing") return "danger"
  return "muted"
}

function operationTone(state: DeploymentOperationState) {
  if (state === "success") return "text-v2-state-fg-success"
  if (state === "failure" || state === "timed-out") return "text-v2-state-fg-danger"
  if (state === "in-progress" || state === "dispatching" || state === "queued") return "text-v2-state-fg-warning"
  return "text-v2-text-text-muted"
}
