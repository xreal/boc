import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentCapabilityStatus, DeploymentReadiness } from "../rpcs"

export function DeploymentReadinessPanel(props: {
  t: BocTranslator
  readiness: DeploymentReadiness
  retrying: boolean
  onRetry: () => void
  onOpenSettings: () => void
}) {
  const unavailable = () => props.readiness.capabilities.filter((capability) => capability.status === "unavailable")

  return (
    <section
      data-boc-deployments-readiness
      role="status"
      class="flex min-h-0 flex-1 items-center justify-center px-6 py-10"
    >
      <div class="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-5">
        <div class="flex items-start gap-3">
          <Icon name="outline-hexagonal-warning" class="mt-0.5 shrink-0 text-v2-state-fg-warning" />
          <div class="min-w-0">
            <h2 class="text-[15px] leading-[var(--line-height-base)] [font-weight:530]">
              {props.t("boc.deployments.readiness.title")}
            </h2>
            <p class="mt-1 text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">
              {props.t("boc.deployments.readiness.description")}
            </p>
          </div>
        </div>

        <ul class="flex flex-col gap-2">
          <For each={unavailable()}>
            {(capability) => (
              <li class="rounded-md border border-v2-border-border-muted bg-v2-background-bg-base px-3 py-2">
                <p class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
                  {deploymentCapabilityLabel(props.t, capability)}
                </p>
                <p class="mt-1 text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
                  {deploymentCapabilityFix(props.t, capability)}
                </p>
              </li>
            )}
          </For>
        </ul>

        <div class="flex flex-wrap justify-end gap-2">
          <Button type="button" size="small" variant="outline" onClick={props.onOpenSettings}>
            {props.t("boc.deployments.toolbar.settings")}
          </Button>
          <Button type="button" size="small" variant="neutral" disabled={props.retrying} onClick={props.onRetry}>
            {props.retrying ? props.t("boc.deployments.readiness.retrying") : props.t("boc.deployments.error.retry")}
          </Button>
        </div>
      </div>
    </section>
  )
}

export function DeploymentReadinessSummary(props: { t: BocTranslator; readiness: DeploymentReadiness }) {
  const unavailable = () => props.readiness.capabilities.filter((capability) => capability.status === "unavailable")
  return (
    <div class="flex flex-col gap-2" data-boc-deployments-readiness-summary>
      <Show
        when={unavailable().length > 0}
        fallback={
          <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-state-fg-success">
            {props.t("boc.deployments.readiness.fleetReady")}
          </p>
        }
      >
        <For each={unavailable()}>
          {(capability) => (
            <div class="min-w-0 break-words text-[12px] leading-[var(--line-height-compact)]">
              <span class="[font-weight:530]">{deploymentCapabilityLabel(props.t, capability)}</span>
              <span class="text-v2-text-text-muted"> — {deploymentCapabilityFix(props.t, capability)}</span>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

function deploymentCapabilityLabel(t: BocTranslator, status: DeploymentCapabilityStatus) {
  return t(`boc.deployments.readiness.capability.${status.capability}`)
}

function deploymentCapabilityFix(t: BocTranslator, status: DeploymentCapabilityStatus) {
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
  if (status.capability === "platform_supported") return t("boc.deployments.screen.unsupported.description")
  return t("boc.deployments.readiness.fix.future")
}
