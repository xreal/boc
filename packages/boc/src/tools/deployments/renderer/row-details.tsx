import type { BocTranslator } from "../../../renderer/i18n"
import { formatDeploymentAge, type DeploymentSystem } from "../domain/systems"
import { Show } from "solid-js"
import { DeploymentOperationDetails } from "./operation-progress"

export function DeploymentRowDetails(props: {
  t: BocTranslator
  system: DeploymentSystem
  ticketStatus?: string
  openExternal: (url: string) => void
}) {
  const value = (content?: string) => content || props.t("boc.deployments.table.noValue")

  return (
    <section
      id={`deployment-details-${props.system.environment}`}
      aria-label={props.t("boc.deployments.details.title", { system: props.system.name })}
      class="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-6 gap-y-3 border-t border-v2-border-border-muted bg-v2-background-bg-layer-01 px-11 py-3"
    >
      <Detail label={props.t("boc.deployments.details.application")} value={props.system.app} />
      <Detail label={props.t("boc.deployments.table.branch")} value={value(props.system.branch)} />
      <Detail label={props.t("boc.deployments.table.ticket")} value={value(props.system.ticketKey)} />
      <Detail label={props.t("boc.deployments.table.ticketStatus")} value={value(props.ticketStatus)} />
      <Detail
        label={props.t("boc.deployments.table.sync")}
        value={props.t(`boc.deployments.sync.${props.system.sync}`)}
      />
      <Detail
        label={props.t("boc.deployments.table.health")}
        value={props.t(`boc.deployments.health.${props.system.health}`)}
      />
      <Detail
        label={props.t("boc.deployments.table.age")}
        value={value(formatDeploymentAge(props.system.ageSeconds))}
      />
      <Detail
        label={props.t("boc.deployments.table.autoSync")}
        value={props.t(`boc.deployments.autoSync.${props.system.autoSync}`)}
      />
      <Detail
        label={props.t("boc.deployments.details.availability")}
        value={props.t(`boc.deployments.availability.${props.system.availability}`)}
      />
      <Detail label={props.t("boc.deployments.details.revision")} value={value(props.system.deployedRevision)} mono />
      <Detail label={props.t("boc.deployments.details.deployedAt")} value={value(props.system.deployedAt)} />
      <Detail
        label={props.t("boc.deployments.details.operation")}
        value={
          props.system.operation
            ? props.t(`boc.deployments.operation.${props.system.operation.state}`)
            : props.t("boc.deployments.details.none")
        }
      />
      <Show when={props.system.operation}>
        {(operation) => (
          <DeploymentOperationDetails t={props.t} operation={operation()} openExternal={props.openExternal} />
        )}
      </Show>
    </section>
  )
}

function Detail(props: { label: string; value: string; mono?: boolean }) {
  return (
    <dl class="min-w-0 text-[12px] leading-[var(--line-height-compact)]">
      <dt class="text-v2-text-text-muted">{props.label}</dt>
      <dd class="mt-0.5 truncate text-v2-text-text-base" classList={{ "font-mono": props.mono }} title={props.value}>
        {props.value}
      </dd>
    </dl>
  )
}
