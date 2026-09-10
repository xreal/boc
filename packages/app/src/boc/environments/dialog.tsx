import { createBocTranslator, type BocTranslator } from "@boc/extensions/renderer"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import { createEffect, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"
import { actionLabel, resourceAnnouncement, type EnvironmentActionTarget } from "./view"
import { environmentDuration, retryableEnvironmentAction } from "./model"
import type { EnvironmentResource } from "./store"
import { EnvironmentTerminalOutput } from "./terminal-output"
import { EnvironmentContainerLogs } from "./container-logs"
import "./dialog.css"

export function EnvironmentDetailsDialog(props: {
  target: EnvironmentActionTarget
  resource: EnvironmentResource
  domain: () => string | undefined
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const dialog = useDialog()
  const [view, setView] = createStore({ now: Date.now(), output: "run" })
  const environment = () => props.resource.state.environment
  const run = () => environment()?.latestRun
  const busy = () => run()?.status === "running" || !!props.resource.state.acting
  const disabled = () => busy() || !environment()?.availability.available
  const stack = () => {
    const current = environment()?.stack
    return current?.status === "configured" ? current : undefined
  }
  const containers = () => environment()?.containers.items ?? []
  const retry = () => retryableEnvironmentAction(environment())
  onCleanup(props.resource.watchStatus())
  createEffect(() => {
    if (run()?.status !== "running") return
    setView("now", Date.now())
    const timer = setInterval(() => setView("now", Date.now()), 1000)
    onCleanup(() => clearInterval(timer))
  })
  const activate = (action: BocEnvironment.Action, containerID?: string) => {
    setView("output", "run")
    return props.resource.run(action, props.target.session.id, {
      domain: action === "setup" ? props.domain() : undefined,
      containerID,
    })
  }
  const remove = () => dialog.push(() => <EnvironmentRemoveDialog target={props.target} resource={props.resource} />)
  const copy = (text: string) =>
    void (platform.writeClipboardText?.(text) ?? navigator.clipboard.writeText(text)).then(
      () => showToast({ variant: "success", title: language.t("common.copied") }),
      () => showToast({ variant: "error", title: language.t("common.requestFailed") }),
    )
  const announcement = () => {
    if (run()?.status === "running" && run()?.phase === "readiness") return t("boc.environments.panel.waiting")
    const status = resourceAnnouncement(t, environment(), false, undefined)
    return run()?.service
      ? t("boc.environments.panel.serviceResult", { service: run()?.service ?? "", status })
      : status
  }
  const issue = () => {
    if (props.resource.state.failed) return t("boc.environments.requestFailed")
    if (props.resource.state.rejection) return t(`boc.environments.operationRejected.${props.resource.state.rejection}`)
    if (props.resource.state.stale) return t("boc.environments.stale")
    if (environment() && !environment()?.availability.available) return availabilityLabel(t, environment())
    if (environment()?.stack.status === "invalid") return t("boc.environments.status.invalid")
    return ""
  }

  return (
    <Dialog size="large" containerClass="boc-environment-dialog">
      <DialogHeader closeLabel={t("boc.environments.close")}>
        <DialogTitleGroup title={t("boc.environments.title")} description={t("boc.environments.panel.description")} />
      </DialogHeader>
      <DialogBody class="boc-environment-panel">
        <section class="boc-environment-summary">
          <div class="boc-environment-identity">
            <bdi dir="ltr" class="boc-environment-name">
              {stack()?.stackID ?? props.target.session.location.directory.split("/").at(-1)}
            </bdi>
            <div class="boc-environment-badges">
              <span
                data-tone={
                  environment()?.containers.status === "running"
                    ? "success"
                    : environment()?.containers.status === "partial"
                      ? "warning"
                      : "neutral"
                }
              >
                <Icon name="status" size="small" />
                {t("boc.environments.panel.containerCount", {
                  running: environment()?.containers.running ?? 0,
                  total: environment()?.containers.total ?? 0,
                })}
              </span>
              <span
                data-tone={
                  environment()?.http.status === "ready"
                    ? "success"
                    : environment()?.http.status === "unreachable"
                      ? "warning"
                      : "neutral"
                }
              >
                {t(`boc.environments.panel.http.${environment()?.http.status ?? "unknown"}`)}
              </span>
            </div>
          </div>
          <div class="boc-environment-toolbar">
            <Show
              when={stack()}
              fallback={<span class="boc-environment-muted">{t("boc.environments.status.unconfigured")}</span>}
            >
              <button
                class="boc-environment-url"
                onClick={() => {
                  const current = stack()
                  if (current) platform.openExternal(current.url)
                }}
                title={stack()?.url}
              >
                <bdi dir="ltr">{stack()?.host}</bdi>
                <Icon name="arrow-up-right" size="small" />
              </button>
            </Show>
            <div class="boc-environment-actions">
              <Show
                when={stack()}
                fallback={
                  <Button variant="contrast" size="small" disabled={disabled()} onClick={() => void activate("setup")}>
                    {t("boc.environments.setup")}
                  </Button>
                }
              >
                <Button
                  variant="neutral"
                  size="small"
                  disabled={disabled() || environment()?.containers.status === "running"}
                  onClick={() => void activate("start")}
                >
                  {t("boc.environments.panel.startAll")}
                </Button>
                <Button
                  variant="neutral"
                  size="small"
                  disabled={disabled() || !environment()?.containers.running}
                  onClick={() => void activate("stop")}
                >
                  {t("boc.environments.panel.stopAll")}
                </Button>
              </Show>
              <Button
                variant="ghost"
                size="small"
                aria-label={t("boc.environments.refresh")}
                title={t("boc.environments.refresh")}
                disabled={props.resource.state.refreshing}
                onClick={() => void props.resource.inspect()}
              >
                <Icon
                  name="refresh"
                  size="small"
                  classList={{ "boc-environment-refreshing": props.resource.state.refreshing }}
                />
              </Button>
              <Menu>
                <Menu.Trigger as={Button} variant="ghost" size="small" aria-label={t("boc.environments.menu")}>
                  <Icon name="outline-dots" size="small" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Content>
                    <Show when={stack()}>
                      <Menu.Item
                        onSelect={() => {
                          const current = stack()
                          if (current) platform.openExternal(current.url)
                        }}
                      >
                        {t("boc.environments.open")}
                      </Menu.Item>
                      <Menu.Item onSelect={() => copy(stack()?.url ?? "")}>{t("boc.environments.copyUrl")}</Menu.Item>
                      <Menu.Item disabled={disabled()} onSelect={() => void activate("setup")}>
                        {t("boc.environments.setupAgain")}
                      </Menu.Item>
                    </Show>
                    <Menu.Item onSelect={() => copy(props.target.session.location.directory)}>
                      {t("boc.environments.copyPath")}
                    </Menu.Item>
                    <Show when={stack()}>
                      <Menu.Separator />
                      <Menu.Item class="text-v2-state-fg-danger" disabled={disabled()} onSelect={remove}>
                        {t("boc.environments.remove")}
                      </Menu.Item>
                    </Show>
                  </Menu.Content>
                </Menu.Portal>
              </Menu>
            </div>
          </div>
        </section>

        <section class="boc-environment-services" aria-label={t("boc.environments.panel.services")}>
          <div class="boc-environment-section-heading">
            <h3>{t("boc.environments.panel.services")}</h3>
            <span class="boc-environment-muted">
              {busy() ? t("boc.environments.panel.locked") : t("boc.environments.panel.checkoutOnly")}
            </span>
          </div>
          <div class="boc-environment-service-scroll">
            <Show
              when={containers().length}
              fallback={
                <p class="boc-environment-empty">
                  {t(
                    environment()?.containers.status === "unknown"
                      ? "boc.environments.panel.inspectionFailed"
                      : "boc.environments.panel.noServices",
                  )}
                </p>
              }
            >
              <table class="boc-environment-service-table">
                <thead>
                  <tr>
                    <th>{t("boc.environments.panel.service")}</th>
                    <th>{t("boc.environments.panel.state")}</th>
                    <th>{t("boc.environments.panel.health")}</th>
                    <th>
                      <span class="sr-only">{t("boc.environments.menu")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <For each={containers()}>
                    {(container) => (
                      <tr data-selected={view.output === container.id}>
                        <td>
                          <details>
                            <summary>
                              <bdi dir="auto">{container.service}</bdi>
                              <bdi dir="ltr" class="boc-environment-container-name">
                                {container.name}
                              </bdi>
                            </summary>
                            <div class="boc-environment-container-details">
                              <button title={container.id} onClick={() => copy(container.id)}>
                                {t("boc.environments.panel.copyID")}
                              </button>
                              <For each={container.ports}>{(port) => <bdi dir="ltr">{port}</bdi>}</For>
                              <Show when={container.state === "exited" || container.state === "dead"}>
                                <span>{t("boc.environments.panel.exitCode", { code: container.exitCode })}</span>
                              </Show>
                            </div>
                          </details>
                        </td>
                        <td>
                          <span
                            class="boc-environment-service-state"
                            data-tone={
                              container.state === "running"
                                ? "success"
                                : container.state === "dead" ||
                                    (container.state === "exited" && container.exitCode !== 0)
                                  ? "danger"
                                  : container.state === "restarting"
                                    ? "warning"
                                    : "neutral"
                            }
                          >
                            {run()?.status === "running" && run()?.containerID === container.id
                              ? t("boc.environments.panel.working")
                              : t(`boc.environments.container.${container.state}`)}
                          </span>
                        </td>
                        <td>
                          <span
                            data-tone={
                              container.health === "healthy"
                                ? "success"
                                : container.health === "unhealthy"
                                  ? "danger"
                                  : "neutral"
                            }
                          >
                            {t(`boc.environments.health.${container.health}`)}
                          </span>
                        </td>
                        <td>
                          <div class="boc-environment-row-actions">
                            <Button
                              size="small"
                              variant="ghost"
                              aria-label={t("boc.environments.panel.logsFor", { service: container.service })}
                              onClick={() => setView("output", container.id)}
                            >
                              {t("boc.environments.panel.logs")}
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              disabled={
                                disabled() || !["running", "restarting", "exited", "created"].includes(container.state)
                              }
                              aria-label={t(
                                container.state === "running" || container.state === "restarting"
                                  ? "boc.environments.panel.stopService"
                                  : "boc.environments.panel.startService",
                                { service: container.service },
                              )}
                              onClick={() =>
                                void activate(
                                  container.state === "running" || container.state === "restarting" ? "stop" : "start",
                                  container.id,
                                )
                              }
                            >
                              {t(
                                container.state === "running" || container.state === "restarting"
                                  ? "boc.environments.action.stop"
                                  : "boc.environments.action.start",
                              )}
                            </Button>
                            <Menu>
                              <Menu.Trigger
                                as={Button}
                                variant="ghost"
                                size="small"
                                aria-label={t("boc.environments.panel.actionsFor", { service: container.service })}
                              >
                                <Icon name="outline-dots" size="small" />
                              </Menu.Trigger>
                              <Menu.Portal>
                                <Menu.Content>
                                  <Menu.Item
                                    disabled={
                                      disabled() ||
                                      !["running", "restarting", "exited", "created"].includes(container.state)
                                    }
                                    onSelect={() => void activate("restart", container.id)}
                                  >
                                    {t("boc.environments.panel.restart")}
                                  </Menu.Item>
                                  <Menu.Item onSelect={() => copy(container.id)}>
                                    {t("boc.environments.panel.copyID")}
                                  </Menu.Item>
                                </Menu.Content>
                              </Menu.Portal>
                            </Menu>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </Show>
            <details class="boc-environment-details">
              <summary>{t("boc.environments.panel.details")}</summary>
              <p>{availabilityLabel(t, environment())}</p>
              <p>{t("boc.environments.setup.cacheEffect")}</p>
              <p>{t(`boc.environments.status.${environment()?.stack.status ?? "unknown"}`)}</p>
              <bdi dir="ltr">{props.target.session.location.directory}</bdi>
              <p>{t("boc.environments.settings.shared.description")}</p>
            </details>
          </div>
        </section>

        <section class="boc-environment-output-section" aria-label={t("boc.environments.details.output")}>
          <label class="boc-environment-output-selector">
            <span>{t("boc.environments.panel.output")}</span>
            <select value={view.output} onChange={(event) => setView("output", event.currentTarget.value)}>
              <option value="run">{t("boc.environments.output.latestRun")}</option>
              <For each={containers()}>{(container) => <option value={container.id}>{container.service}</option>}</For>
              <Show when={view.output !== "run" && !containers().some((item) => item.id === view.output)}>
                <option value={view.output}>{t("boc.environments.logs.removed")}</option>
              </Show>
            </select>
          </label>
          <div class="boc-environment-output-view" hidden={view.output !== "run"}>
            <EnvironmentTerminalOutput run={run()} resize={props.resource.resize} />
          </div>
          <Show when={view.output !== "run"}>
            <EnvironmentContainerLogs containerID={view.output} resource={props.resource} />
          </Show>
        </section>
      </DialogBody>
      <DialogFooter>
        <div class="boc-environment-footer">
          <div
            class="boc-environment-result"
            data-tone={
              issue() || run()?.status === "failed" ? "danger" : run()?.status === "succeeded" ? "success" : "neutral"
            }
          >
            <p role={issue() ? "alert" : "status"} aria-live="polite" aria-atomic="true">
              {issue() || announcement()}
            </p>
            <span class="boc-environment-runtime">
              {run()
                ? t("boc.environments.details.runtime", {
                    duration: environmentDuration(run()?.startedAt ?? 0, run()?.endedAt ?? view.now),
                  })
                : ""}
              <Show when={run()?.exitCode !== undefined}>
                {" "}
                · {t("boc.environments.panel.exitCode", { code: run()?.exitCode ?? 0 })}
              </Show>
            </span>
          </div>
          <Show when={run()?.status === "running"}>
            <Button
              variant="warning"
              size="small"
              disabled={!!props.resource.state.acting}
              onClick={() => void props.resource.cancel()}
            >
              {t("boc.environments.cancel")}
            </Button>
          </Show>
          <Show when={retry()}>
            {(action) => (
              <Button
                variant="neutral"
                size="small"
                disabled={disabled()}
                onClick={() => {
                  if (action() === "remove") return remove()
                  void activate(action(), run()?.containerID)
                }}
              >
                {t("boc.environments.retry", { action: actionLabel(t, action()) })}
              </Button>
            )}
          </Show>
          <Button autofocus variant="ghost" size="small" onClick={() => dialog.close()}>
            {language.t("common.close")}
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  )
}

export function EnvironmentRemoveDialog(props: { target: EnvironmentActionTarget; resource: EnvironmentResource }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const dialog = useDialog()
  const remove = async () => {
    const accepted = await props.resource.run("remove", props.target.session.id, { confirmation: "remove-environment" })
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

function availabilityLabel(t: BocTranslator, environment?: BocEnvironment.State) {
  if (!environment) return t("boc.environments.checking")
  if (environment.availability.available) return t("boc.environments.details.available")
  return t(`boc.environments.details.unavailable.${environment.availability.reason}`)
}
