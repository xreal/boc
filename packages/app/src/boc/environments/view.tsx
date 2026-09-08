import { createBocTranslator, type BocTranslator } from "@boc/extensions/renderer"
import type { SessionInfo } from "@opencode-ai/client/promise"
import type { BocEnvironment } from "@opencode-ai/schema/boc/environment"
import { environmentApi } from "./api"
import { Icon } from "@opencode-ai/ui/icon"
import { Menu } from "@opencode-ai/ui/menu"
import { Spinner } from "@opencode-ai/ui/spinner"
import { SplitButton, SplitButtonAction, SplitButtonMenuTrigger } from "@opencode-ai/ui/split-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { createMediaQuery } from "@solid-primitives/media"
import { createEffect, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import type { ServerSDK } from "@/runtime/server/client"
import { ServerConnection } from "@/runtime/server/registry"
import type { LocalProject } from "@/shell/state/layout"
import { showToast } from "@/shell/notifications/toast"
import { pathKey } from "@/workspaces/path-key"
import { environmentPrimaryIntent, retryableEnvironmentAction, type EnvironmentPrimaryIntent } from "./model"
import { useEnvironmentProjectSettings } from "./settings-store"
import { useEnvironmentResource, type EnvironmentResource } from "./store"
import "./view.css"

export type EnvironmentTarget = {
  server: ServerConnection.Any
  sdk: ServerSDK
  project: LocalProject
  session: SessionInfo
}

export type EnvironmentActionTarget = Pick<EnvironmentTarget, "server" | "project" | "session">

export function environmentTarget(input: {
  server?: ServerConnection.Any
  sdk?: ServerSDK
  project?: LocalProject
  session?: SessionInfo
  os?: "macos" | "windows" | "linux"
}): EnvironmentTarget | undefined {
  if (!input.server || !input.sdk || !input.project || !input.session) return
  if (!ServerConnection.local(input.server) || input.os === "windows") return
  if (!input.project.id || input.project.id === "global") return
  if (pathKey(input.project.worktree) === pathKey(input.session.location.directory)) return
  return { server: input.server, sdk: input.sdk, project: input.project, session: input.session }
}

export function useEnvironmentView(target: EnvironmentTarget) {
  const platform = usePlatform()
  const settings = useEnvironmentProjectSettings({
    scope: target.sdk.scope,
    projectDirectory: target.project.worktree,
    platform,
  })
  const resource = useEnvironmentResource({
    server: ServerConnection.key(target.server),
    projectID: target.session.projectID,
    directory: target.session.location.directory,
    api: () => environmentApi(target.sdk.api),
  })

  createEffect(() => {
    if (!settings.ready() || !settings.settings.enabled) return
    if (target.sdk.connection.status() !== "connected") return
    target.sdk.connection.attempt()
    void resource.inspect()
  })

  return { platform, settings, resource }
}

export function EnvironmentTitlebarControl(props: { target: EnvironmentTarget }) {
  const view = useEnvironmentView(props.target)

  return (
    <EnvironmentControl
      target={props.target}
      resource={view.resource}
      settingsReady={view.settings.ready}
      enabled={() => view.settings.settings.enabled}
      domain={() => view.settings.settings.domain.trim() || undefined}
    />
  )
}

export function EnvironmentControl(props: {
  target: EnvironmentActionTarget
  resource: EnvironmentResource
  settingsReady: () => boolean
  enabled: () => boolean
  domain: () => string | undefined
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const wide = createMediaQuery("(min-width: 1100px)")
  const [menu, setMenu] = createStore({ open: false })
  let actionButton: HTMLButtonElement | undefined

  const intent = () =>
    environmentPrimaryIntent({
      settingsReady: props.settingsReady(),
      enabled: props.enabled(),
      loading: props.resource.state.loading,
      failed: props.resource.state.failed,
      environment: props.resource.state.environment,
    })
  const label = () => primaryLabel(t, intent())
  const actions = createEnvironmentActions({
    target: props.target,
    resource: props.resource,
    domain: props.domain,
    returnFocus: () => actionButton?.focus(),
  })
  const activate = async () => {
    const current = intent()
    if (current === "checking") return
    if (current === "configure") return actions.settings()
    if (current === "retry-inspect") return void props.resource.inspect()
    if (current === "details") return actions.details()
    if (current === "open") return actions.open()
    await actions.runAndShowDetails(current)
  }

  return (
    <SplitButton class="mx-1" data-boc-environment-control data-expanded-label={wide()}>
      <Tooltip placement="bottom" value={label()} class="flex items-center">
        <SplitButtonAction
          ref={actionButton}
          aria-label={label()}
          aria-busy={props.resource.state.loading || !!props.resource.state.acting}
          disabled={intent() === "checking" || !!props.resource.state.acting}
          onClick={() => void activate()}
        >
          <Show when={intent() !== "checking" && !props.resource.state.acting} fallback={<EnvironmentSpinner />}>
            <Icon name={primaryIcon(intent())} size="small" />
          </Show>
          <Show when={wide()}>
            <span class="max-w-40 truncate">{label()}</span>
          </Show>
        </SplitButtonAction>
      </Tooltip>
      <Menu
        gutter={4}
        modal={false}
        placement="bottom-end"
        open={menu.open}
        onOpenChange={(open) => {
          setMenu("open", open)
          if (open && props.enabled()) void props.resource.inspect()
        }}
      >
        <Menu.Trigger
          as={SplitButtonMenuTrigger}
          aria-label={t("boc.environments.menu")}
          disabled={!props.settingsReady() || !!props.resource.state.acting}
        >
          <Icon name="chevron-down" size="small" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content class="min-w-56">
            <Menu.Group>
              <Menu.GroupLabel>{t("boc.environments.title")}</Menu.GroupLabel>
              <EnvironmentMenuItems t={t} enabled={props.enabled()} resource={props.resource} actions={actions} />
            </Menu.Group>
          </Menu.Content>
        </Menu.Portal>
      </Menu>
      <EnvironmentAnnouncement t={t} resource={props.resource} />
    </SplitButton>
  )
}

export function EnvironmentContextMenuItems(props: { target: EnvironmentTarget; returnFocus?: () => void }) {
  const view = useEnvironmentView(props.target)
  return (
    <EnvironmentContextMenu
      target={props.target}
      resource={view.resource}
      settingsReady={view.settings.ready}
      enabled={() => view.settings.settings.enabled}
      domain={() => view.settings.settings.domain.trim() || undefined}
      returnFocus={props.returnFocus}
    />
  )
}

export function EnvironmentContextMenu(props: {
  target: EnvironmentActionTarget
  resource: EnvironmentResource
  settingsReady: () => boolean
  enabled: () => boolean
  domain: () => string | undefined
  returnFocus?: () => void
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const actions = createEnvironmentActions({
    target: props.target,
    resource: props.resource,
    domain: props.domain,
    returnFocus: props.returnFocus,
  })

  return (
    <>
      <Menu.Separator />
      <Menu.Group>
        <Menu.GroupLabel>{t("boc.environments.title")}</Menu.GroupLabel>
        <Show when={props.settingsReady()} fallback={<Menu.Item disabled>{t("boc.environments.checking")}</Menu.Item>}>
          <EnvironmentMenuItems t={t} enabled={props.enabled()} resource={props.resource} actions={actions} />
        </Show>
      </Menu.Group>
      <EnvironmentAnnouncement t={t} resource={props.resource} />
    </>
  )
}

type EnvironmentActions = ReturnType<typeof createEnvironmentActions>

function EnvironmentMenuItems(props: {
  t: BocTranslator
  enabled: boolean
  resource: EnvironmentResource
  actions: EnvironmentActions
}) {
  const environment = () => props.resource.state.environment
  const running = () => environment()?.latestRun?.status === "running"
  const retry = () => retryableEnvironmentAction(environment())
  const configured = () => environment()?.stack.status === "configured"
  const canStart = () => configured() && environment()?.containers.status === "stopped"
  const canStop = () => {
    const status = environment()?.containers.status
    return status === "running" || status === "partial"
  }
  const runAndShowDetails = (action: "setup" | "start" | "stop") => () => void props.actions.runAndShowDetails(action)

  return (
    <>
      <Show
        when={props.enabled}
        fallback={
          <Menu.Item onSelect={() => void props.actions.settings()}>
            <Icon name="settings-gear" size="small" />
            {props.t("boc.environments.configure")}
          </Menu.Item>
        }
      >
        <Show
          when={!props.resource.state.loading || environment()}
          fallback={
            <Menu.Item disabled>
              <EnvironmentSpinner />
              {props.t("boc.environments.checking")}
            </Menu.Item>
          }
        >
          <Menu.Item onSelect={() => void props.actions.details()}>
            <Icon name="terminal" size="small" />
            {props.t("boc.environments.viewOutput")}
          </Menu.Item>
          <Show when={running()}>
            <Menu.Item disabled={!!props.resource.state.acting} onSelect={() => void props.resource.cancel()}>
              <Icon name="stop" size="small" />
              {props.t("boc.environments.cancel")}
            </Menu.Item>
          </Show>
          <Show when={!running() && retry()} keyed>
            {(action) => (
              <Menu.Item disabled={!!props.resource.state.acting} onSelect={() => void props.actions.retry(action)}>
                <Icon name="reset" size="small" />
                {props.t("boc.environments.retry", { action: actionLabel(props.t, action) })}
              </Menu.Item>
            )}
          </Show>
          <Show when={!running() && !retry() && environment()?.availability.available && !configured()}>
            <Menu.Item disabled={!!props.resource.state.acting} onSelect={runAndShowDetails("setup")}>
              <Icon name="workspace-isolated" size="small" />
              {props.t("boc.environments.setup")}
            </Menu.Item>
          </Show>
          <Show when={!running() && !retry() && configured()}>
            <Menu.Item disabled={!!props.resource.state.acting} onSelect={runAndShowDetails("setup")}>
              <Icon name="workspace-isolated" size="small" />
              {props.t("boc.environments.setupAgain")}
            </Menu.Item>
          </Show>
          <Show when={!running() && !retry() && canStart()}>
            <Menu.Item disabled={!!props.resource.state.acting} onSelect={runAndShowDetails("start")}>
              <Icon name="circle-check" size="small" />
              {props.t("boc.environments.start")}
            </Menu.Item>
          </Show>
          <Show when={!running() && !retry() && canStop()}>
            <Menu.Item disabled={!!props.resource.state.acting} onSelect={runAndShowDetails("stop")}>
              <Icon name="stop" size="small" />
              {props.t("boc.environments.stop")}
            </Menu.Item>
          </Show>
          <Show when={configured()}>
            <Menu.Separator />
            <Menu.Item onSelect={props.actions.open}>
              <Icon name="arrow-up-right" size="small" />
              {props.t("boc.environments.open")}
            </Menu.Item>
            <Menu.Item onSelect={() => void props.actions.copy()}>
              <Icon name="outline-copy" size="small" />
              {props.t("boc.environments.copyUrl")}
            </Menu.Item>
            <Show when={!running()}>
              <Menu.Item
                class="text-v2-state-fg-danger"
                disabled={!!props.resource.state.acting}
                onSelect={() => void props.actions.remove()}
              >
                <Icon name="trash" size="small" />
                {props.t("boc.environments.remove")}
              </Menu.Item>
            </Show>
          </Show>
        </Show>
        <Menu.Separator />
        <Menu.Item
          disabled={props.resource.state.loading || props.resource.state.refreshing}
          onSelect={() => void props.resource.inspect()}
        >
          <Icon name="reset" size="small" />
          {props.t("boc.environments.refresh")}
        </Menu.Item>
        <Menu.Item onSelect={() => void props.actions.settings()}>
          <Icon name="settings-gear" size="small" />
          {props.t("boc.environments.configure")}
        </Menu.Item>
      </Show>
      <Menu.Separator />
      <Menu.Item onSelect={() => void props.actions.copyPath()}>
        <Icon name="outline-copy" size="small" />
        {props.t("boc.environments.copyPath")}
      </Menu.Item>
      <Show when={props.actions.canOpenTerminal}>
        <Menu.Item onSelect={() => void props.actions.openTerminal()}>
          <Icon name="terminal" size="small" />
          {props.t("boc.environments.openTerminal")}
        </Menu.Item>
      </Show>
    </>
  )
}

function EnvironmentAnnouncement(props: { t: BocTranslator; resource: EnvironmentResource }) {
  return (
    <span
      class="sr-only"
      role={props.resource.state.failed || props.resource.state.rejection ? "alert" : "status"}
      aria-live="polite"
      aria-atomic="true"
    >
      {resourceAnnouncement(
        props.t,
        props.resource.state.environment,
        props.resource.state.failed,
        props.resource.state.rejection,
      )}
    </span>
  )
}

function createEnvironmentActions(input: {
  target: EnvironmentActionTarget
  resource: EnvironmentResource
  domain: () => string | undefined
  returnFocus?: () => void
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const dialog = useDialog()
  const copyPath = () =>
    (
      platform.writeClipboardText?.(input.target.session.location.directory) ??
      navigator.clipboard.writeText(input.target.session.location.directory)
    ).then(
      () => showToast({ variant: "success", title: language.t("common.copied") }),
      () => showToast({ variant: "error", title: language.t("common.requestFailed") }),
    )
  const canOpenTerminal = platform.platform === "desktop" && !!platform.openPath && platform.os === "macos"
  const openTerminal = () =>
    platform
      .openPath?.(input.target.session.location.directory, "Terminal")
      .catch(() => showToast({ variant: "error", title: language.t("common.requestFailed") }))
  const run = (action: "setup" | "start" | "stop") =>
    input.resource.run(action, input.target.session.id, { domain: action === "setup" ? input.domain() : undefined })
  const open = () => {
    const stack = input.resource.state.environment?.stack
    if (stack?.status === "configured") platform.openExternal(stack.url)
  }
  const copy = async () => {
    const stack = input.resource.state.environment?.stack
    if (stack?.status !== "configured") return
    await (platform.writeClipboardText?.(stack.url) ?? navigator.clipboard.writeText(stack.url)).then(
      () =>
        showToast({
          variant: "success",
          title: t("boc.environments.copied.title"),
          description: t("boc.environments.copied.description"),
        }),
      () => showToast({ variant: "error", title: t("boc.environments.copyFailed") }),
    )
  }
  const details = async () => {
    const { EnvironmentDetailsDialog } = await import("./dialog")
    dialog.show(
      () => <EnvironmentDetailsDialog target={input.target} resource={input.resource} domain={input.domain} />,
      input.returnFocus,
    )
  }
  const runAndShowDetails = async (action: "setup" | "start" | "stop") => {
    await run(action)
    await details()
  }
  const remove = async () => {
    const { EnvironmentRemoveDialog } = await import("./dialog")
    dialog.show(() => <EnvironmentRemoveDialog target={input.target} resource={input.resource} />, input.returnFocus)
  }
  const settings = async () => {
    const { DialogEditProject } = await import("@/settings/workspaces/project-dialog")
    dialog.show(
      () => <DialogEditProject project={input.target.project} server={input.target.server} initialTab="scripts" />,
      input.returnFocus,
    )
  }
  const retry = async (action: NonNullable<ReturnType<typeof retryableEnvironmentAction>>) => {
    if (action === "remove") return remove()
    await input.resource.run(action, input.target.session.id, {
      domain: action === "setup" ? input.domain() : undefined,
    })
    await details()
  }
  return {
    run,
    runAndShowDetails,
    retry,
    open,
    copy,
    details,
    remove,
    settings,
    copyPath,
    canOpenTerminal,
    openTerminal,
  }
}

export function actionLabel(t: BocTranslator, action: "setup" | "start" | "stop" | "remove") {
  return t(`boc.environments.action.${action}`)
}

export function resourceAnnouncement(
  t: BocTranslator,
  environment: BocEnvironment.State | undefined,
  failed: boolean,
  rejection?: "operation-running" | "not-available" | "not-configured" | "confirmation-required",
) {
  if (rejection) return t(`boc.environments.operationRejected.${rejection}`)
  if (failed) return t("boc.environments.requestFailed")
  const run = environment?.latestRun
  if (run) return t(`boc.environments.run.${run.status}`, { action: actionLabel(t, run.action) })
  if (!environment) return t("boc.environments.checking")
  if (!environment.availability.available) return t("boc.environments.status.unavailable")
  if (environment.stack.status === "unconfigured") return t("boc.environments.status.unconfigured")
  if (environment.stack.status === "invalid") return t("boc.environments.status.invalid")
  return t(`boc.environments.status.${environment.containers.status}`)
}

function primaryLabel(t: BocTranslator, intent: EnvironmentPrimaryIntent) {
  if (intent === "retry-inspect") return t("boc.environments.retryCheck")
  if (intent === "details") return t("boc.environments.viewOutput")
  return t(`boc.environments.${intent}`)
}

function primaryIcon(intent: EnvironmentPrimaryIntent) {
  if (intent === "configure") return "settings-gear"
  if (intent === "setup") return "workspace-isolated"
  if (intent === "start") return "circle-check"
  if (intent === "open") return "arrow-up-right"
  if (intent === "retry-inspect") return "reset"
  return "terminal"
}

function EnvironmentSpinner() {
  return <Spinner class="size-3.5 motion-reduce:[&_*]:!animate-none" />
}
