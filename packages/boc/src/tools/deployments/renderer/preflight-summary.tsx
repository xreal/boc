import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import { devSystemName } from "../domain/environments"
import type { DeploymentFailure, DeploymentPreparedPlan } from "../rpcs"

export function DeploymentPreflightSummary(props: {
  t: BocTranslator
  plan?: DeploymentPreparedPlan
  reviewing: boolean
  expired: boolean
}) {
  return (
    <section class="flex flex-col gap-2 rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 px-3 py-3">
      <h2 class="text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
        {props.t("boc.deployments.deploy.preflight.title")}
      </h2>
      <Show when={props.reviewing}>
        <p class="text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
          {props.t("boc.deployments.deploy.preflight.reviewing")}
        </p>
      </Show>
      <Show when={props.expired}>
        <p role="status" class="text-[12px] leading-[var(--line-height-compact)] text-v2-state-fg-warning">
          {props.t("boc.deployments.deploy.preflight.expired")}
        </p>
      </Show>
      <Show when={!props.reviewing ? props.plan : undefined}>
        {(plan) => (
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px] leading-[var(--line-height-compact)]">
            <dt class="text-v2-text-text-muted">{props.t("boc.deployments.deploy.preflight.environment")}</dt>
            <dd class="font-mono">{devSystemName(plan().environment)}</dd>
            <dt class="text-v2-text-text-muted">{props.t("boc.deployments.deploy.preflight.ref")}</dt>
            <dd class="font-mono">{plan().ref}</dd>
            <dt class="text-v2-text-text-muted">{props.t("boc.deployments.deploy.preflight.workflows")}</dt>
            <dd>
              <For each={plan().workflows}>
                {(workflow) => (
                  <div>
                    {workflow.name} <span class="font-mono text-v2-text-text-muted">({workflow.filename})</span>
                  </div>
                )}
              </For>
            </dd>
            <dt class="text-v2-text-text-muted">{props.t("boc.deployments.deploy.preflight.inputs")}</dt>
            <dd class="font-mono">
              <For each={plan().workflows}>
                {(workflow) => (
                  <div>
                    {workflow.filename}:{" "}
                    {Object.entries(workflow.inputs)
                      .map(([name, value]) => `${name}=${String(value)}`)
                      .join(", ") || "—"}
                  </div>
                )}
              </For>
            </dd>
          </dl>
        )}
      </Show>
      <Show when={props.plan && props.plan.warnings.length > 0 && !props.reviewing}>
        <ul class="text-[12px] leading-[var(--line-height-compact)] text-v2-state-fg-warning">
          <For each={props.plan?.warnings ?? []}>
            {(warning) => (
              <li>{warning === "unsafe-target" ? props.t("boc.deployments.deploy.warning.unsafe-target") : warning}</li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}

export function deploymentFailureMessage(t: BocTranslator, failure: DeploymentFailure) {
  if (failure.category === "conflict") return t("boc.deployments.deploy.failure.conflict")
  if (failure.category === "unsafe-target") return t("boc.deployments.deploy.failure.unsafe")
  if (failure.category === "timeout") return t("boc.deployments.deploy.failure.timeout")
  if (failure.category === "invalid-input" || failure.category === "not-found") {
    return t("boc.deployments.deploy.failure.invalid")
  }
  return t("boc.deployments.deploy.failure.generic")
}
