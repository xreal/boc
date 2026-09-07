import { For, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import { deploymentWorkflowUrl } from "../domain/github"
import { isTerminalDeploymentOperation, type DeploymentOperationSummary } from "../domain/operations"

export function DeploymentProgress(props: { t: BocTranslator; operation: DeploymentOperationSummary; now: number }) {
  const activeJob = () => {
    const jobs = props.operation.workflows.flatMap((workflow) => workflow.jobs ?? [])
    return (
      jobs.find((job) => job.state === "in-progress") ??
      jobs.find((job) => job.state === "waiting" || job.state === "queued")
    )
  }
  const unavailable = () => props.operation.workflows.some((workflow) => workflow.trackingUnavailable)
  const finished = () => isTerminalDeploymentOperation(props.operation.state)
  return (
    <div class="mt-1 flex max-w-64 flex-col gap-0.5 text-[11px] text-v2-text-text-muted">
      <Show when={!finished()}>
        <span
          class="truncate"
          title={unavailable() ? props.t("boc.deployments.progress.unavailable") : activeJob()?.name}
        >
          <bdi>
            {unavailable()
              ? props.t("boc.deployments.progress.unavailable")
              : (activeJob()?.name ?? props.t("boc.deployments.progress.waiting"))}
          </bdi>
        </span>
      </Show>
      <span class="tabular-nums">
        {props.t(finished() ? "boc.deployments.progress.finished" : "boc.deployments.progress.running", {
          duration: deploymentDuration(props.operation, props.now),
        })}
      </span>
    </div>
  )
}

export function DeploymentOperationDetails(props: {
  t: BocTranslator
  operation: DeploymentOperationSummary
  openExternal: (url: string) => void
}) {
  return (
    <div
      class="col-span-full flex min-w-0 flex-col gap-3 border-t border-v2-border-border-muted pt-3"
      aria-live="polite"
    >
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <bdi class="font-mono">{props.operation.branch}</bdi>
        <Show when={props.operation.finishedAt}>
          {(finishedAt) => (
            <span class="text-v2-text-text-muted">
              {props.t("boc.deployments.progress.finishedAt", { time: new Date(finishedAt()).toLocaleString() })}
            </span>
          )}
        </Show>
      </div>
      <For each={props.operation.workflows}>
        {(workflow) => (
          <div class="min-w-0 text-[12px]">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
              <bdi class="font-mono">{workflow.filename}</bdi>
              <span>{props.t(`boc.deployments.operation.${workflow.state}`)}</span>
              <a
                class="underline underline-offset-2"
                href={deploymentWorkflowUrl(workflow)}
                onClick={(event) => {
                  event.preventDefault()
                  props.openExternal(deploymentWorkflowUrl(workflow))
                }}
              >
                {props.t(workflow.runId ? "boc.deployments.progress.run" : "boc.deployments.progress.workflowLink")}
              </a>
              <Show when={workflow.jobs?.length}>
                <span class="text-v2-text-text-muted">
                  {props.t("boc.deployments.progress.jobs", {
                    completed:
                      workflow.jobs?.filter(
                        (job) =>
                          job.state === "skipped" ||
                          (job.state !== "waiting" && isTerminalDeploymentOperation(job.state)),
                      ).length ?? 0,
                    total: workflow.jobs?.length ?? 0,
                  })}
                </span>
              </Show>
            </div>
            <Show when={workflow.trackingUnavailable}>
              <p class="mt-1 text-v2-state-fg-warning">{props.t("boc.deployments.progress.unavailable")}</p>
            </Show>
            <Show
              when={workflow.jobs?.length}
              fallback={<p class="mt-1 text-v2-text-text-muted">{props.t("boc.deployments.progress.empty")}</p>}
            >
              <ul class="mt-2 flex flex-col gap-1 border-s border-v2-border-border-muted ps-3">
                <For each={workflow.jobs}>
                  {(job) => (
                    <li class="flex min-w-0 items-start gap-2">
                      <span class="shrink-0 text-v2-text-text-muted">
                        {props.t(`boc.deployments.operation.${job.state}`)}
                      </span>
                      <bdi class="min-w-0 break-words">{job.name}</bdi>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <Show when={workflow.completion}>
              <p class="mt-2 text-v2-text-text-muted">
                {props.t(
                  workflow.completion === "deployment"
                    ? "boc.deployments.progress.deployed"
                    : "boc.deployments.progress.workflow",
                )}
              </p>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

export function deploymentDuration(operation: DeploymentOperationSummary, now: number) {
  const end = operation.finishedAt ?? (isTerminalDeploymentOperation(operation.state) ? operation.updatedAt : undefined)
  const seconds = Math.max(0, Math.floor(((end ? Date.parse(end) : now) - Date.parse(operation.createdAt)) / 1000))
  if (!Number.isFinite(seconds)) return "—"
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
