import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import { createResource, For, Show } from "solid-js"
import { useBocDesktop } from "../../../renderer/desktop"
import type { BocTranslator } from "../../../renderer/i18n"
import { deploymentAgeSeconds, formatDeploymentAge, type DeploymentSystem } from "../../deployments/domain/systems"
import { jiraRelativeTime } from "./time"
import { deploymentSiteUrl } from "../../deployments/domain/site-url"
import { StatusText, syncTone, healthTone } from "../../deployments/renderer/system-status"

export function JiraIssueDeployments(props: {
  t: BocTranslator
  locale: string
  systems?: readonly DeploymentSystem[]
  onDeploy?: (system?: DeploymentSystem) => void
  onOpenExternal: (url: string) => void
}) {
  const desktop = useBocDesktop()
  const [settings] = createResource(() => desktop?.deployments.getSettings().catch(() => undefined))
  const hasSystems = () => Boolean(props.systems && props.systems.length > 0)

  return (
    <section class="flex flex-col gap-3 border-t border-v2-border-border-muted pt-4">
      <div class="flex h-6 items-center justify-between">
        <h3 class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:530]">
          {props.t("boc.jira.board.deployments.title")}
        </h3>
        <Show when={props.onDeploy}>
          <Button type="button" variant="neutral" size="small" onClick={() => props.onDeploy?.(props.systems?.[0])}>
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
              <DeploymentSystemRow
                t={props.t}
                locale={props.locale}
                system={system}
                siteUrl={deploymentSiteUrl(system.environment, settings())}
                onOpenExternal={props.onOpenExternal}
                onClick={props.onDeploy ? () => props.onDeploy?.(system) : undefined}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  )
}

function DeploymentSystemRow(props: {
  t: BocTranslator
  locale: string
  system: DeploymentSystem
  siteUrl: string
  onOpenExternal: (url: string) => void
  onClick?: () => void
}) {
  return (
    <div class="flex flex-col gap-1.5 px-1 py-1.5 text-start">
      <div class="flex items-center gap-2 text-[12px] leading-[var(--line-height-compact)]">
        <ServerIcon class="size-3.5 shrink-0 text-v2-state-fg-success" />
        <a
          href={props.siteUrl}
          target="_blank"
          rel="noreferrer"
          class="shrink-0 whitespace-nowrap font-mono [font-weight:530] text-v2-state-fg-success hover:underline focus-visible:underline"
          onClick={(event) => {
            event.preventDefault()
            props.onOpenExternal(props.siteUrl)
          }}
        >
          {props.system.name}
        </a>
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

      <div class="flex flex-wrap items-center gap-3 text-[12px] leading-[var(--line-height-compact)]">
        <StatusText label={props.t(`boc.deployments.sync.${props.system.sync}`)} tone={syncTone(props.system.sync)} />
        <StatusText
          label={props.t(`boc.deployments.health.${props.system.health}`)}
          tone={healthTone(props.system.health)}
        />
        <span class="ms-auto flex items-center gap-1.5 text-v2-text-text-muted tabular-nums">
          <ClockIcon class="size-3.5 text-v2-text-text-faint" />
          <span>{deploymentAgeDisplay(props.system, props.locale, props.t)}</span>
        </span>
        <Show when={props.onClick}>
          <Tooltip value={props.t("boc.jira.board.deployments.deployTo", { system: props.system.name })}>
            <IconButton
              size="small"
              variant="ghost-muted"
              icon={<Icon name="arrow-right" />}
              onClick={props.onClick}
              aria-label={props.t("boc.jira.board.deployments.deployTo", { system: props.system.name })}
            />
          </Tooltip>
        </Show>
      </div>
    </div>
  )
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
