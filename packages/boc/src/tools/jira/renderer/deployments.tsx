import { Button } from "@opencode/ui/button"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import {
  deploymentAgeSeconds,
  formatDeploymentAge,
  type DeploymentSystem,
} from "../../deployments/domain/systems"
import { jiraRelativeTime } from "./time"

export function JiraIssueDeployments(props: {
  t: BocTranslator
  locale: string
  systems?: readonly DeploymentSystem[]
  onDeploy?: (system?: DeploymentSystem) => void
}) {
  const hasSystems = () => Boolean(props.systems && props.systems.length > 0)

  return (
    <section class="flex flex-col gap-2 border-t border-v2-border-border-muted pt-4">
      <div class="flex items-center justify-between">
        <h3 class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:530]">
          {props.t("boc.jira.board.deployments.title")}
        </h3>
        <Show when={props.onDeploy}>
          <Button
            type="button"
            variant="neutral"
            size="small"
            onClick={() => props.onDeploy?.(props.systems?.[0])}
          >
            {props.t("boc.jira.board.deployments.deploy")}
          </Button>
        </Show>
      </div>

      <Show
        when={hasSystems()}
        fallback={
          <p class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-faint">
            {props.t("boc.jira.board.deployments.empty")}
          </p>
        }
      >
        <div class="flex flex-col gap-2">
          <For each={props.systems}>
            {(system) => (
              <DeploymentSystemCard
                t={props.t}
                locale={props.locale}
                system={system}
                onClick={props.onDeploy ? () => props.onDeploy?.(system) : undefined}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

function DeploymentSystemCard(props: {
  t: BocTranslator
  locale: string
  system: DeploymentSystem
  onClick?: () => void
}) {
  return (
    <div
      role={props.onClick ? "button" : undefined}
      tabIndex={props.onClick ? 0 : undefined}
      onClick={props.onClick}
      onKeyDown={(event) => {
        if (props.onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          props.onClick()
        }
      }}
      class="flex flex-col gap-2 rounded-[6px] border border-v2-border-border-muted bg-v2-background-bg-button-neutral px-3 py-2.5 text-left outline-none transition-[border-color,background-color] duration-100 hover:border-v2-border-border-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-v2-border-border-focus"
      classList={{ "cursor-pointer": Boolean(props.onClick) }}
    >
      <div class="flex items-center gap-2 text-[12px] leading-[var(--line-height-compact)]">
        <ServerIcon class="size-3.5 shrink-0 text-v2-state-fg-success" />
        <span class="font-mono [font-weight:530] text-v2-state-fg-success">
          {props.system.name}
        </span>
        <Show when={props.system.branch}>
          {(branch) => (
            <span
              class="min-w-0 truncate font-mono text-[12px] text-v2-text-text-muted hover:text-v2-text-text-base"
              title={branch()}
            >
              {branch()}
            </span>
          )}
        </Show>
      </div>

      <div class="flex items-center gap-3 text-[12px] leading-[var(--line-height-compact)]">
        <span class={`flex items-center gap-1.5 [font-weight:530] ${syncTone(props.system.sync)}`}>
          <CheckCircleIcon class="size-3.5" />
          <span>{props.t(`boc.deployments.sync.${props.system.sync}`)}</span>
        </span>
        <span class={`flex items-center gap-1.5 [font-weight:530] ${healthTone(props.system.health)}`}>
          <HeartPulseIcon class="size-3.5" />
          <span>{props.t(`boc.deployments.health.${props.system.health}`)}</span>
        </span>
        <span class="ml-auto flex items-center gap-1.5 text-v2-text-text-muted tabular-nums">
          <ClockIcon class="size-3.5 text-v2-text-text-faint" />
          <span>{deploymentAgeDisplay(props.system, props.locale, props.t)}</span>
        </span>
      </div>
    </div>
  )
}

export function syncTone(sync: DeploymentSystem["sync"]) {
  if (sync === "synced") return "text-v2-state-fg-success"
  if (sync === "out-of-sync") return "text-v2-state-fg-warning"
  return "text-v2-text-text-muted"
}

export function healthTone(health: DeploymentSystem["health"]) {
  if (health === "healthy") return "text-v2-state-fg-success"
  if (health === "progressing" || health === "suspended") return "text-v2-state-fg-warning"
  if (health === "degraded" || health === "missing") return "text-v2-state-fg-danger"
  return "text-v2-text-text-muted"
}

export function deploymentAgeDisplay(system: DeploymentSystem, locale: string, t: BocTranslator) {
  if (system.ageSeconds !== undefined) {
    const formatted = formatDeploymentAge(system.ageSeconds)
    if (formatted) return t("boc.jira.board.deployments.age", { age: formatted })
  }
  if (system.deployedAt) {
    const ageSeconds = deploymentAgeSeconds(system.deployedAt)
    const formatted = formatDeploymentAge(ageSeconds)
    if (formatted) return t("boc.jira.board.deployments.age", { age: formatted })
    return jiraRelativeTime(system.deployedAt, locale) ?? "—"
  }
  return "—"
}

function ServerIcon(props: { class?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" class={props.class}>
      <rect x="2" y="3" width="12" height="4" rx="1" />
      <rect x="2" y="9" width="12" height="4" rx="1" />
      <circle cx="4.5" cy="5" r="0.5" fill="currentColor" />
      <circle cx="4.5" cy="11" r="0.5" fill="currentColor" />
    </svg>
  )
}

function CheckCircleIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <circle cx="8" cy="8" r="6" />
      <polyline points="5.5 8 7.2 9.7 10.5 6.4" />
    </svg>
  )
}

function HeartPulseIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <path d="M8 13.8L2.7 8.5a3.6 3.6 0 0 1 0-5.1 3.6 3.6 0 0 1 5.1 0L8 3.6l.2-.2a3.6 3.6 0 0 1 5.1 0 3.6 3.6 0 0 1 0 5.1L8 13.8z" />
      <path d="M4.5 8h1.8l1-2 1.4 4 1-2h1.8" />
    </svg>
  )
}

function ClockIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.3"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class}
    >
      <circle cx="8" cy="8" r="6" />
      <polyline points="8 5 8 8 10.5 9.5" />
    </svg>
  )
}
