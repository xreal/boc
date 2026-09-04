import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentCapabilityStatus, DeploymentReadiness } from "../rpcs"

const checkGroups = [
  {
    id: "fleet",
    capabilities: [
      "platform_supported",
      "deployment_settings",
      "argocd_cli",
      "dev_target_verified",
      "argocd_auth",
      "argocd_list_applications",
    ],
  },
  { id: "deploy", capabilities: ["gh_cli", "github_auth", "github_repo_access", "github_workflow_dispatch"] },
  { id: "optional", capabilities: ["bf_deploy_auto_sync"] },
] as const

export function DeploymentReadinessPanel(props: {
  t: BocTranslator
  readiness: DeploymentReadiness
  retrying: boolean
  onRetry: () => void
  onOpenSettings: () => void
}) {
  return (
    <section
      data-boc-deployments-readiness
      aria-busy={props.retrying}
      class="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-5">
        <div class="flex items-start gap-3">
          <Icon name="outline-hexagonal-warning" class="mt-0.5 shrink-0 text-v2-state-fg-warning" />
          <div class="min-w-0">
            <h2 class="text-[15px] leading-[var(--line-height-base)] [font-weight:530]">
              {props.t("boc.deployments.readiness.title")}
            </h2>
            <p class="mt-1 text-[13px] leading-[var(--line-height-base)] text-v2-text-text-base">
              {props.t("boc.deployments.readiness.description")}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p role="status" class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-base">
            {props.t(props.retrying ? "boc.deployments.readiness.retrying" : "boc.deployments.readiness.retryHelp")}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button type="button" size="small" variant="outline" onClick={props.onOpenSettings}>
              {props.t("boc.deployments.toolbar.settings")}
            </Button>
            <Button type="button" size="small" variant="neutral" disabled={props.retrying} onClick={props.onRetry}>
              {props.t(props.retrying ? "boc.deployments.readiness.retrying" : "boc.deployments.settings.retry")}
            </Button>
          </div>
        </div>
        <DeploymentReadinessSummary t={props.t} readiness={props.readiness} />
      </div>
    </section>
  )
}

export function DeploymentReadinessSummary(props: { t: BocTranslator; readiness: DeploymentReadiness }) {
  return (
    <div class="flex flex-col gap-4" data-boc-deployments-readiness-summary>
      <For each={checkGroups}>
        {(group) => {
          const checks = () =>
            group.capabilities.flatMap((name) =>
              props.readiness.capabilities.filter((check) => check.capability === name),
            )
          const ready = () =>
            checks().length === group.capabilities.length && checks().every((check) => check.status === "available")
          return (
            <section class="overflow-hidden rounded-md border border-v2-border-border-muted bg-v2-background-bg-base">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-v2-border-border-muted px-3 py-2.5">
                <h3 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
                  {props.t(`boc.deployments.readiness.group.${group.id}`)}
                </h3>
                <span
                  class="text-[12px] leading-[var(--line-height-compact)]"
                  classList={{
                    "text-v2-state-fg-success": ready(),
                    "text-v2-state-fg-warning": !ready() && group.id !== "optional",
                  }}
                >
                  {props.t(
                    ready()
                      ? "boc.deployments.readiness.status.available"
                      : group.id === "optional"
                        ? "boc.deployments.readiness.optional"
                        : "boc.deployments.readiness.required",
                  )}
                </span>
                <p class="w-full text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-base">
                  {props.t(`boc.deployments.readiness.group.${group.id}.help`)}
                </p>
              </div>
              <ul class="divide-y divide-v2-border-border-muted">
                <For each={checks().filter((check) => check.status === "unavailable")}>
                  {(check) => <DeploymentCheck t={props.t} check={check} optional={group.id === "optional"} />}
                </For>
              </ul>
              <Show when={checks().some((check) => check.status !== "unavailable")}>
                <details class="border-t border-v2-border-border-muted">
                  <summary class="cursor-pointer px-3 py-2 text-[12px] leading-[var(--line-height-compact)] focus-visible:outline-2 focus-visible:outline-offset-[-2px]">
                    {props.t("boc.deployments.readiness.otherChecks")}
                  </summary>
                  <ul class="divide-y divide-v2-border-border-muted">
                    <For each={checks().filter((check) => check.status !== "unavailable")}>
                      {(check) => <DeploymentCheck t={props.t} check={check} optional={group.id === "optional"} />}
                    </For>
                  </ul>
                </details>
              </Show>
            </section>
          )
        }}
      </For>
      <p class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-base">
        {props.t("boc.deployments.readiness.pendingHelp")}
      </p>
    </div>
  )
}

function DeploymentCheck(props: { t: BocTranslator; check: DeploymentCapabilityStatus; optional: boolean }) {
  return (
    <li class="px-3 py-2.5">
      <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-[12px] leading-[var(--line-height-compact)]">
        <span class="[font-weight:530]">{deploymentCapabilityLabel(props.t, props.check)}</span>
        <span
          class="shrink-0"
          classList={{
            "text-v2-state-fg-success": props.check.status === "available",
            "text-v2-state-fg-warning": props.check.status === "unavailable" && !props.optional,
          }}
        >
          {props.t(
            props.optional && props.check.status === "unavailable"
              ? "boc.deployments.readiness.notConfigured"
              : `boc.deployments.readiness.status.${props.check.status}`,
          )}
        </span>
      </div>
      <Show when={props.check.status === "unavailable"}>
        <p class="mt-1 text-[12px] leading-[var(--line-height-base)] text-v2-text-text-base">
          {deploymentCapabilityFix(props.t, props.check)}
        </p>
      </Show>
    </li>
  )
}

function deploymentCapabilityLabel(t: BocTranslator, status: DeploymentCapabilityStatus) {
  return t(`boc.deployments.readiness.capability.${status.capability}`)
}

function deploymentCapabilityFix(t: BocTranslator, status: DeploymentCapabilityStatus) {
  if (status.failure === "network") return t("boc.deployments.readiness.fix.network")
  if (status.failure === "timeout") return t("boc.deployments.readiness.fix.timeout")
  if (status.failure === "rate-limit") return t("boc.deployments.readiness.fix.rateLimit")
  if (status.failure === "malformed") return t("boc.deployments.readiness.fix.malformed")
  if (status.capability === "argocd_cli") return t("boc.deployments.readiness.fix.argocd_cli")
  if (status.capability === "dev_target_verified") {
    if (status.context?.reason === "unsupported-flags") {
      return t("boc.deployments.readiness.fix.argocd_flags")
    }
    if (status.context?.executable === "kubectl") return t("boc.deployments.readiness.fix.kubectl")
    return t("boc.deployments.readiness.fix.dev_target")
  }
  if (status.capability === "argocd_auth") return t("boc.deployments.readiness.fix.argocd_auth")
  if (status.capability === "argocd_list_applications") return t("boc.deployments.readiness.fix.argo_list")
  if (status.capability === "deployment_settings") return t("boc.deployments.readiness.fix.settings")
  if (status.capability === "bf_deploy_auto_sync") return t("boc.deployments.readiness.fix.devenv")
  if (status.capability === "gh_cli") return t("boc.deployments.readiness.fix.gh_cli")
  if (status.capability === "github_auth") return t("boc.deployments.readiness.fix.github_auth")
  if (status.capability === "github_repo_access") return t("boc.deployments.readiness.fix.github_repo")
  if (status.capability === "github_workflow_dispatch") return t("boc.deployments.readiness.fix.github_dispatch")
  if (status.capability === "platform_supported") return t("boc.deployments.screen.unsupported.description")
  return t("boc.deployments.readiness.fix.future")
}
