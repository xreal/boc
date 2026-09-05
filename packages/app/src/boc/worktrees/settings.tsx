import { createBocTranslator, useBocDesktop, type BocTranslator } from "@boc/extensions/renderer"
import { Badge } from "@opencode-ai/ui/badge"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { Project } from "@opencode-ai/schema/project"
import { RIFT_BACKEND_VERSION } from "@opencode-ai/schema/boc/rift"
import { getDirectory } from "@opencode-ai/util/path"
import { createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { ServerConnection } from "@/runtime/server/registry"
import { useServer } from "@/runtime/server/current"
import { useServerSDK } from "@/runtime/server/client"
import type { LocalProject } from "@/shell/state/layout"
import { SettingsRow } from "@/settings/row"
import { backendName, capabilityReason, type RiftCapability, type WorktreeProjectBackend } from "./policy"

export function BocWorktreeDefaultSetting(props: { server?: ServerConnection.Any }) {
  const desktop = useBocDesktop()
  const language = useLanguage()
  const platform = usePlatform()
  const t = createBocTranslator(language.locale)
  const [state, setState] = createStore({
    backend: "git" as "git" | "rift",
    loading: true,
    saving: false,
    failed: false,
  })
  let active = true

  onCleanup(() => (active = false))
  onMount(() => {
    if (!desktop) return setState("loading", false)
    void desktop.worktrees.getDefault().then(
      (preference) => active && setState({ backend: preference.defaultBackend, loading: false }),
      () => active && setState({ loading: false, failed: true }),
    )
  })

  const unavailable = () => {
    if (!desktop) return t("boc.worktrees.method.desktopOnly")
    if (platform.platform === "desktop" && platform.os === "windows") {
      return t("boc.worktrees.method.windowsUnsupported")
    }
    if (!props.server || !ServerConnection.local(props.server)) return t("boc.worktrees.method.localOnly")
  }
  const select = async (backend: "git" | "rift") => {
    if (!desktop || state.saving || state.backend === backend || (backend === "rift" && unavailable())) return
    const previous = state.backend
    setState({ backend, saving: true, failed: false })
    await desktop.worktrees.setDefault({ defaultBackend: backend }).then(
      (saved) => active && setState({ backend: saved.defaultBackend, saving: false }),
      () => active && setState({ backend: previous, saving: false, failed: true }),
    )
  }

  return (
    <Show when={desktop}>
      <SettingsRow
        title={
          <span class="flex items-center gap-2">
            {t("boc.worktrees.method.title")}
            <Badge>{t("boc.worktrees.method.experimental")}</Badge>
          </span>
        }
        description={t("boc.worktrees.method.description")}
      >
        <div class="flex w-full flex-col items-stretch gap-2 sm:w-[300px]" aria-busy={state.loading || state.saving}>
          <BackendChoices
            t={t}
            value={state.backend}
            disabled={state.loading || state.saving}
            riftDisabled={!!unavailable()}
            onSelect={(backend) => void select(backend)}
          />
          <p
            class="m-0 text-11-regular leading-text-compact text-v2-text-text-muted"
            classList={{ "text-v2-text-text-danger": state.failed || !!unavailable() }}
            role={state.failed ? "alert" : "status"}
            aria-live="polite"
          >
            {state.loading
              ? t("boc.worktrees.method.loading")
              : state.saving
                ? t("boc.worktrees.method.saving")
                : state.failed
                  ? t("boc.worktrees.method.saveFailed")
                  : (unavailable() ?? t("boc.worktrees.method.storageCheck"))}
          </p>
        </div>
      </SettingsRow>
    </Show>
  )
}

export function BocWorktreeProjectSetting(props: { project: LocalProject; server: ServerConnection.Any }) {
  const desktop = useBocDesktop()
  const language = useLanguage()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const t = createBocTranslator(language.locale)
  const [state, setState] = createStore({
    defaultBackend: "git" as "git" | "rift",
    saved: "inherit" as WorktreeProjectBackend,
    selected: "inherit" as WorktreeProjectBackend,
    capability: undefined as RiftCapability | undefined,
    loading: true,
    saving: false,
    savedMessage: false,
    failed: false,
  })
  let active = true

  onCleanup(() => (active = false))
  onMount(() => {
    const projectID = props.project.id
    if (!desktop || !projectID || projectID === "global") return setState("loading", false)
    const scope = { server: ServerConnection.key(props.server), projectID: Project.ID.make(projectID) }
    void Promise.all([desktop.worktrees.getDefault(), desktop.worktrees.getProject(scope)]).then(
      async ([defaults, preference]) => {
        const capability: RiftCapability = hostReason()
          ? unavailableCapability("unsupported-platform")
          : await serverSDK.api["server.boc.worktree"]
              .riftCapability({
                projectID,
                source: props.project.worktree,
                directory: getDirectory(props.project.worktree),
              })
              .catch(() => unavailableCapability("backend-unavailable"))
        if (!active) return
        const selected = preference.backend ?? "inherit"
        setState({
          defaultBackend: defaults.defaultBackend,
          saved: selected,
          selected,
          capability,
          loading: false,
        })
      },
      () => active && setState({ loading: false, failed: true }),
    )
  })

  const hostReason = () => {
    if (!desktop) return t("boc.worktrees.method.desktopOnly")
    if (platform.platform === "desktop" && platform.os === "windows") {
      return t("boc.worktrees.method.windowsUnsupported")
    }
    if (!ServerConnection.local(props.server)) return t("boc.worktrees.method.localOnly")
  }
  const riftReason = () => {
    if (hostReason()) return hostReason()
    if (!state.capability) return state.loading ? undefined : t("boc.worktrees.method.projectUnavailable")
    if (!state.capability.available) return capabilityReason(t, state.capability.reason)
  }
  const effective = () => (state.selected === "inherit" ? state.defaultBackend : state.selected)
  const options = createMemo(() => [
    {
      value: "inherit" as const,
      label: t("boc.worktrees.method.inherit", { backend: backendName(t, state.defaultBackend) }),
      icon: "workspace-new" as const,
    },
    { value: "git" as const, label: t("boc.worktrees.method.git"), icon: "branch-out" as const },
    { value: "rift" as const, label: t("boc.worktrees.method.rift"), icon: "workspace-isolated" as const },
  ])
  const save = async () => {
    if (!desktop || !props.project.id || state.saving || state.selected === state.saved) return
    setState({ saving: true, savedMessage: false, failed: false })
    await desktop.worktrees
      .setProject({
        server: ServerConnection.key(props.server),
        projectID: Project.ID.make(props.project.id),
        backend: state.selected === "inherit" ? undefined : state.selected,
      })
      .then(
        (preference) => {
          if (!active) return
          const saved = preference.backend ?? "inherit"
          setState({ saved, selected: saved, saving: false, savedMessage: true })
        },
        () => active && setState({ saving: false, failed: true }),
      )
  }

  return (
    <Show when={desktop && props.project.id && props.project.id !== "global"}>
      <section class="flex w-full flex-col gap-3 border-t border-v2-border-border-base pt-5" aria-busy={state.loading}>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2 text-13-medium leading-text-compact text-v2-text-text-base">
            {t("boc.worktrees.method.title")}
            <Badge>{t("boc.worktrees.method.experimental")}</Badge>
          </div>
          <p class="m-0 max-w-[620px] text-12-regular leading-text-base text-v2-text-text-muted">
            {t("boc.worktrees.method.projectDescription")}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("boc.worktrees.method.title")}>
          <For each={options()}>
            {(option) => (
              <button
                type="button"
                role="radio"
                aria-checked={state.selected === option.value}
                disabled={state.loading || state.saving || (option.value === "rift" && !!hostReason())}
                class="flex min-h-10 items-center gap-2 rounded-md border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2 text-left text-12-medium leading-text-compact text-v2-text-text-base outline-none transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:border-v2-border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                classList={{
                  "border-v2-border-border-focus bg-v2-overlay-simple-overlay-selected":
                    state.selected === option.value,
                }}
                onClick={() => setState({ selected: option.value, savedMessage: false, failed: false })}
              >
                <Icon name={option.icon} size="small" class="shrink-0 text-v2-icon-icon-muted" />
                <span>{option.label}</span>
                <Show when={state.selected === option.value}>
                  <Icon name="check" size="small" class="ml-auto shrink-0 text-v2-icon-icon-accent" />
                </Show>
              </button>
            )}
          </For>
        </div>

        <div
          class="rounded-md bg-v2-background-bg-inset px-3 py-2 text-12-regular leading-text-base text-v2-text-text-muted"
          classList={{ "text-v2-text-text-danger": !!riftReason() && effective() === "rift" }}
          role={state.failed ? "alert" : "status"}
          aria-live="polite"
        >
          {state.loading
            ? t("boc.worktrees.method.loading")
            : state.failed
              ? t("boc.worktrees.method.saveFailed")
              : effective() === "rift" && riftReason()
                ? `${t("boc.worktrees.method.fallbackEffective")} ${riftReason()}`
                : state.capability?.available && effective() === "rift"
                  ? t("boc.worktrees.method.available", { filesystem: state.capability.filesystem.toUpperCase() })
                  : t("boc.worktrees.method.effective", { backend: backendName(t, effective()) })}
        </div>

        <div class="flex min-h-8 items-center justify-between gap-3">
          <span class="text-11-regular leading-text-compact text-v2-text-text-muted" aria-live="polite">
            {state.saving
              ? t("boc.worktrees.method.saving")
              : state.savedMessage
                ? t("boc.worktrees.method.saved")
                : ""}
          </span>
          <Button
            type="button"
            variant="neutral"
            disabled={state.loading || state.saving || state.selected === state.saved}
            onClick={() => void save()}
          >
            {t("boc.worktrees.method.save")}
          </Button>
        </div>
      </section>
    </Show>
  )
}

function unavailableCapability(reason: Exclude<RiftCapability, { available: true }>["reason"]): RiftCapability {
  return {
    available: false,
    backend: "boc/rift",
    version: RIFT_BACKEND_VERSION,
    reason,
    message: "",
  }
}

export function BocRiftBadge() {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  return <Badge variant="accent">{t("boc.worktrees.badge")}</Badge>
}

export function BocWorktreeCreationBadge(props: { projectID?: string }) {
  const desktop = useBocDesktop()
  const server = useServer()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const [state, setState] = createStore({ backend: "git" as "git" | "rift" })
  let active = true

  onCleanup(() => (active = false))
  onMount(() => {
    if (!desktop || !server.isLocal) return
    const project = props.projectID
      ? desktop.worktrees.getProject({ server: server.key, projectID: Project.ID.make(props.projectID) })
      : Promise.resolve<{ backend?: "git" | "rift" }>({})
    void Promise.all([desktop.worktrees.getDefault(), project]).then(
      ([defaults, preference]) => {
        if (active) setState("backend", preference.backend ?? defaults.defaultBackend)
      },
      () => undefined,
    )
  })

  return (
    <Show when={state.backend === "rift"}>
      <Tooltip value={t("boc.worktrees.creationHint")} placement="right">
        <span class="ml-auto shrink-0" tabIndex={0} aria-label={t("boc.worktrees.creationHint")}>
          <BocRiftBadge />
        </span>
      </Tooltip>
    </Show>
  )
}

export function BocRiftDeleteDetail(props: { all?: boolean }): JSX.Element {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  return (
    <div class="mt-2 rounded-md bg-v2-background-bg-inset px-3 py-2 text-12-regular leading-text-base text-v2-text-text-muted">
      {t(props.all ? "boc.worktrees.deleteAll.detail" : "boc.worktrees.delete.detail")}
    </div>
  )
}

function BackendChoices(props: {
  t: BocTranslator
  value: "git" | "rift"
  disabled: boolean
  riftDisabled: boolean
  onSelect: (backend: "git" | "rift") => void
}) {
  const choices = () => [
    { value: "git" as const, label: props.t("boc.worktrees.method.git"), icon: "branch-out" as const },
    { value: "rift" as const, label: props.t("boc.worktrees.method.rift"), icon: "workspace-isolated" as const },
  ]
  return (
    <div class="grid grid-cols-2 gap-1 rounded-md bg-v2-background-bg-inset p-1" role="radiogroup">
      <For each={choices()}>
        {(choice) => (
          <button
            type="button"
            role="radio"
            aria-checked={props.value === choice.value}
            disabled={props.disabled || (choice.value === "rift" && props.riftDisabled)}
            class="flex h-8 items-center justify-center gap-1.5 rounded-sm px-2 text-12-medium leading-text-compact text-v2-text-text-muted outline-none transition-colors hover:bg-v2-overlay-simple-overlay-hover focus-visible:ring-1 focus-visible:ring-v2-border-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            classList={{
              "bg-v2-background-bg-base text-v2-text-text-base shadow-xs": props.value === choice.value,
            }}
            onClick={() => props.onSelect(choice.value)}
          >
            <Icon name={choice.icon} size="small" />
            <span>{choice.label}</span>
          </button>
        )}
      </For>
    </div>
  )
}
