import { createBocTranslator, type BocTranslator } from "@boc/extensions/renderer"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { createEffect, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { actionLabel, resourceAnnouncement, type EnvironmentActionTarget } from "./view"
import { environmentDuration, retryableEnvironmentAction } from "./model"
import type { EnvironmentResource } from "./store"
import { environmentOutput } from "./output"
import "./dialog.css"

export function EnvironmentDetailsDialog(props: {
  target: EnvironmentActionTarget
  resource: EnvironmentResource
  domain: () => string | undefined
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const dialog = useDialog()
  const [view, setView] = createStore({ following: true, now: Date.now() })
  let log: HTMLPreElement | undefined
  let frame: number | undefined

  const environment = () => props.resource.state.environment
  const run = () => environment()?.latestRun
  createEffect(() => {
    if (run()?.status !== "running") return
    const timer = setInterval(() => setView("now", Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  const retry = () => retryableEnvironmentAction(environment())
  const configuredStack = () => {
    const stack = environment()?.stack
    return stack?.status === "configured" ? stack : undefined
  }
  const announcement = () =>
    resourceAnnouncement(t, environment(), props.resource.state.failed, props.resource.state.rejection)

  createEffect(() => {
    run()?.log
    if (!view.following || !log) return
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      frame = undefined
      if (log) log.scrollTop = log.scrollHeight
    })
  })
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  const retryRun = async () => {
    const action = retry()
    if (!action) return
    if (action === "remove") {
      dialog.push(() => <EnvironmentRemoveDialog target={props.target} resource={props.resource} />)
      return
    }
    await props.resource.run(action, props.target.session.id, {
      domain: action === "setup" ? props.domain() : undefined,
    })
  }

  return (
    <Dialog size="large" fit containerClass="boc-environment-dialog">
      <DialogHeader closeLabel={t("boc.environments.close")}>
        <DialogTitleGroup title={t("boc.environments.title")} description={t("boc.environments.details.description")} />
      </DialogHeader>
      <DialogBody class="flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-5">
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatusCard
            label={t("boc.environments.details.availability")}
            value={availabilityLabel(t, environment())}
            tone={!environment() ? "neutral" : environment()?.availability.available ? "success" : "danger"}
          />
          <StatusCard
            label={t("boc.environments.details.stack")}
            value={stackLabel(t, environment())}
            tone={
              environment()?.stack.status === "invalid"
                ? "danger"
                : environment()?.stack.status === "configured"
                  ? "success"
                  : "neutral"
            }
          />
          <StatusCard
            label={t("boc.environments.details.containers")}
            value={containerLabel(t, environment())}
            tone={
              environment()?.containers.status === "partial"
                ? "warning"
                : environment()?.containers.status === "running"
                  ? "success"
                  : "neutral"
            }
          />
          <StatusCard
            label={t("boc.environments.details.application")}
            value={httpLabel(t, environment())}
            tone={
              environment()?.http.status === "unreachable"
                ? "danger"
                : environment()?.http.status === "ready"
                  ? "success"
                  : "neutral"
            }
          />
        </div>

        <Show when={configuredStack()} keyed>
          {(stack) => (
            <div class="rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2 text-12-regular leading-text-base text-v2-text-text-muted">
              <bdi dir="ltr" class="block break-all text-v2-text-text-base">
                {stack.url}
              </bdi>
              <bdi dir="ltr" class="block break-all">
                {stack.stackID}
              </bdi>
            </div>
          )}
        </Show>

        <div class="flex flex-col gap-2">
          <div class="flex min-h-6 items-center justify-between gap-3">
            <h3 class="m-0 text-13-medium leading-text-compact text-v2-text-text-base">
              {t("boc.environments.details.output")}
            </h3>
            <Show when={run()} keyed>
              {(latest) => (
                <span class="text-11-regular tabular-nums leading-text-compact text-v2-text-text-muted">
                  {latest.exitCode === undefined
                    ? t("boc.environments.details.runtime", {
                        duration: environmentDuration(latest.startedAt, latest.endedAt ?? view.now),
                      })
                    : t("boc.environments.details.runtimeWithExitCode", {
                        duration: environmentDuration(latest.startedAt, latest.endedAt ?? view.now),
                        code: latest.exitCode,
                      })}
                </span>
              )}
            </Show>
          </div>
          <Show when={run()?.truncated}>
            <p class="m-0 text-11-regular leading-text-compact text-v2-state-fg-warning" role="note">
              {t("boc.environments.details.outputTruncated")}
            </p>
          </Show>
          <pre
            ref={log}
            dir="ltr"
            role="log"
            aria-label={t("boc.environments.details.output")}
            aria-live="off"
            tabIndex={0}
            class="m-0 max-h-80 min-h-36 overflow-auto whitespace-pre rounded-md border border-v2-border-border-base bg-v2-background-bg-deep p-3 text-start text-[12px] leading-[var(--line-height-base)] text-v2-text-text-base outline-none focus-visible:ring-1 focus-visible:ring-v2-border-border-focus motion-reduce:scroll-auto"
            style={{ "font-family": "var(--font-family-mono)" }}
            onScroll={(event) => {
              const element = event.currentTarget
              setView("following", element.scrollHeight - element.scrollTop - element.clientHeight <= 12)
            }}
          >
            {environmentOutput(run()?.log ?? "") || t("boc.environments.details.noOutput")}
          </pre>
        </div>

        <Show when={props.resource.state.stale}>
          <p class="m-0 text-12-regular leading-text-base text-v2-state-fg-warning" role="status">
            {t("boc.environments.stale")}
          </p>
        </Show>
        <p
          class="m-0 min-h-5 text-12-regular leading-text-base text-v2-text-text-muted"
          classList={{ "text-v2-state-fg-danger": props.resource.state.failed || !!props.resource.state.rejection }}
          role={props.resource.state.failed || props.resource.state.rejection ? "alert" : "status"}
          aria-live="polite"
          aria-atomic="true"
        >
          {props.resource.state.refreshing ? t("boc.environments.refreshing") : announcement()}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="ghost"
          disabled={props.resource.state.refreshing}
          onClick={() => void props.resource.inspect()}
        >
          {t("boc.environments.refresh")}
        </Button>
        <Show when={run()?.status === "running"}>
          <Button
            variant="warning"
            disabled={!!props.resource.state.acting}
            onClick={() => void props.resource.cancel()}
          >
            {t("boc.environments.cancel")}
          </Button>
        </Show>
        <Show when={retry()} keyed>
          {(action) => (
            <Button variant="neutral" disabled={!!props.resource.state.acting} onClick={() => void retryRun()}>
              {t("boc.environments.retry", { action: actionLabel(t, action) })}
            </Button>
          )}
        </Show>
        <Button autofocus variant="contrast" onClick={() => dialog.close()}>
          {language.t("common.close")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export function EnvironmentRemoveDialog(props: { target: EnvironmentActionTarget; resource: EnvironmentResource }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const dialog = useDialog()
  const remove = async () => {
    const accepted = await props.resource.run("remove", props.target.session.id, {
      confirmation: "remove-environment",
    })
    if (accepted) dialog.close()
  }
  return (
    <Dialog fit>
      <DialogHeader hideClose>
        <DialogTitleGroup
          title={t("boc.environments.remove.title")}
          description={t("boc.environments.remove.description")}
        />
      </DialogHeader>
      <DialogFooter>
        <Button autofocus variant="ghost" disabled={!!props.resource.state.acting} onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button variant="danger" disabled={!!props.resource.state.acting} onClick={() => void remove()}>
          {t("boc.environments.remove.confirm")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

function StatusCard(props: { label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" }) {
  return (
    <div
      class="flex min-h-16 items-start gap-2 rounded-md border p-3"
      role="group"
      aria-label={props.label}
      classList={{
        "border-v2-border-border-base bg-v2-background-bg-base text-v2-text-text-base": props.tone === "neutral",
        "border-v2-state-border-success bg-v2-state-bg-success text-v2-state-fg-success": props.tone === "success",
        "border-v2-state-border-warning bg-v2-state-bg-warning text-v2-state-fg-warning": props.tone === "warning",
        "border-v2-state-border-danger bg-v2-state-bg-danger text-v2-state-fg-danger": props.tone === "danger",
      }}
    >
      <Icon
        name={
          props.tone === "success"
            ? "circle-check"
            : props.tone === "danger"
              ? "warning"
              : props.tone === "warning"
                ? "circle-exclamation"
                : "status"
        }
        size="small"
        class="mt-0.5 shrink-0"
      />
      <div class="min-w-0">
        <div class="text-11-medium leading-text-compact text-v2-text-text-muted">{props.label}</div>
        <div class="text-12-regular leading-text-base">{props.value}</div>
      </div>
    </div>
  )
}

function availabilityLabel(t: BocTranslator, environment?: BocEnvironment.State) {
  if (!environment) return t("boc.environments.checking")
  if (environment.availability.available)
    return t(`boc.environments.details.available.${environment.availability.strategy}`)
  return t(`boc.environments.details.unavailable.${environment.availability.reason}`)
}

function stackLabel(t: BocTranslator, environment?: BocEnvironment.State) {
  if (!environment) return t("boc.environments.checking")
  return t(`boc.environments.status.${environment.stack.status}`)
}

function containerLabel(t: BocTranslator, environment?: BocEnvironment.State) {
  if (!environment) return t("boc.environments.checking")
  if (environment.containers.total > 0)
    return t("boc.environments.details.containerCount", {
      running: environment.containers.running,
      total: environment.containers.total,
    })
  return t(`boc.environments.status.${environment.containers.status}`)
}

function httpLabel(t: BocTranslator, environment?: BocEnvironment.State) {
  if (!environment) return t("boc.environments.checking")
  return t(`boc.environments.status.${environment.http.status}`)
}
