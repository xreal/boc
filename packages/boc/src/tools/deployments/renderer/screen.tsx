import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocScreenProps } from "../../../registry"
import { useBocDesktop } from "../../../renderer/desktop"
import { createBocTranslator } from "../../../renderer/i18n"
import { deploymentTicketKey, formatDeploymentAge, type DeploymentSystem } from "../domain/systems"
import { isBlockingDeploymentOperation, type DeploymentOperationSummary } from "../domain/operations"
import { deploymentSystemFixtures, deploymentTicketStatusFixtures } from "../fixtures/systems"
import type { DeploymentCacheRunSnapshot, DeploymentFailure, DeploymentReadiness, DeploymentSettings } from "../rpcs"
import { createLatestDeploymentRequest } from "./latest-request"
import { DeploymentDialog } from "./deploy-dialog"
import { createFixtureDeploymentApi } from "../fixtures/preflight"
import { DeploymentReadinessPanel } from "./readiness-panel"
import { DeploymentSettingsDialog } from "./settings-dialog"
import { DeploymentSkeleton, DeploymentSystemsTable } from "./systems-table"
import {
  deploymentFixtureMode,
  deploymentPlatformSupported,
  deploymentSurface,
  filterDeploymentSystems,
  type DeploymentAvailabilityFilter,
} from "./surface"
import { DeploymentsToolbar } from "./toolbar"
import "./deployments.css"
import { AutoSyncOffDialog } from "./auto-sync-dialog"
import { CacheDialog } from "./cache-dialog"
import { DEPLOYMENT_ACTIONS_URL } from "../domain/github"
import { deploymentSshCommand } from "../domain/admin-server"
import { deploymentGithubNotice } from "./github-notice"
import { parseJiraCloudSite } from "../../jira/domain/site"
import { JIRA_ISSUE_STATUS_BATCH_SIZE, JIRA_ISSUE_STATUS_CACHE_MS } from "../../jira/domain/issue"

type JiraStatusCacheEntry = {
  fetchedAt: number
  statusName?: string
}

export default function DeploymentsScreen(props: BocScreenProps) {
  const desktop = useBocDesktop()
  const dialog = useDialog()
  const t = createBocTranslator(() => props.host.locale())
  const fixtureEnabled = new URLSearchParams(props.host.location().search).has("fixture")
  const fixture = deploymentFixtureMode(props.host.location().search)
  let bootstrapGeneration = 0
  let cacheTimer: ReturnType<typeof setTimeout> | undefined
  let fixtureCacheRun: DeploymentCacheRunSnapshot | undefined
  let operationTimer: ReturnType<typeof setTimeout> | undefined
  let jiraStatusTimer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const [now, setNow] = createSignal(Date.now())
  const [view, setView] = createStore({
    search: "",
    availability: "all" as DeploymentAvailabilityFilter,
    expanded: undefined as string | undefined,
    settings: undefined as DeploymentSettings | undefined,
    readiness: undefined as DeploymentReadiness | undefined,
    systems: [] as readonly DeploymentSystem[],
    fetchedAt: undefined as string | undefined,
    staleFailure: undefined as DeploymentFailure | undefined,
    loading: !fixtureEnabled,
    refreshing: false,
    transportFailure: false,
    refreshNotice: undefined as "success" | "failure" | undefined,
    queuedNotice: undefined as { system: string; state: DeploymentOperationSummary["state"] } | undefined,
    queuedOperations: {} as Record<string, DeploymentOperationSummary>,
    cacheRuns: {} as Record<string, DeploymentCacheRunSnapshot | undefined>,
    terminalWidth: 520,
    terminalHeight: 300,
  })

  if (!desktop) return null

  const [jiraOrigin] = createResource(async () => {
    const connection = await desktop.jira.getConnectionStatus().catch(() => undefined)
    if (!connection || connection.status === "not-configured" || !connection.site) return
    return parseJiraCloudSite(connection.site)?.origin
  })

  const requests = createLatestDeploymentRequest({
    cancel: (requestId) => void desktop.deployments.cancelSystemsRead({ requestId }).catch(() => undefined),
  })
  const jiraStatusRequests = createLatestDeploymentRequest({
    prefix: "deployment-jira-status",
    cancel: (requestId) => void desktop.jira.cancelIssueResourceRead({ resource: "issue-statuses", requestId }).catch(() => undefined),
  })
  const [jiraTicketStatuses, setJiraTicketStatuses] = createSignal<Readonly<Record<string, string>>>({})
  const jiraStatusCache = new Map<string, JiraStatusCacheEntry>()
  const systems = () => {
    if (!fixtureEnabled) return view.systems
    if (fixture === "empty" || fixture === "error" || fixture === "loading") return []
    return deploymentSystemFixtures.map((system) => {
      const operation = view.queuedOperations[system.environment] ?? system.operation
      return {
        ...system,
        ...(operation ? { operation } : {}),
        allowedActions:
          operation && isBlockingDeploymentOperation(operation.state)
            ? []
            : (["deploy", "reset", "clear-cache"] as const),
      }
    })
  }
  const ticketKeys = (targets: readonly DeploymentSystem[]) => [
    ...new Set(
      targets.flatMap((system) => {
        const key = system.ticketKey ?? deploymentTicketKey(system.branch)
        return key ? [key.toUpperCase()] : []
      }),
    ),
  ]
  const updateDisplayedTicketStatuses = (keys: readonly string[]) =>
    setJiraTicketStatuses(
      Object.fromEntries(
        keys.flatMap((key) => {
          const statusName = jiraStatusCache.get(key)?.statusName
          return statusName ? [[key, statusName]] : []
        }),
      ),
    )
  const refreshJiraStatuses = async (targets: readonly DeploymentSystem[], refreshExpired: boolean) => {
    const keys = ticketKeys(targets)
    if (fixtureEnabled) {
      setJiraTicketStatuses(
        Object.fromEntries(
          keys.flatMap((key) => {
            const statusName = deploymentTicketStatusFixtures[key]
            return statusName ? [[key, statusName]] : []
          }),
        ),
      )
      return
    }

    const currentTime = Date.now()
    const missing = keys.filter((key) => {
      const cached = jiraStatusCache.get(key)
      return cached === undefined || (refreshExpired && currentTime - cached.fetchedAt >= JIRA_ISSUE_STATUS_CACHE_MS)
    })
    updateDisplayedTicketStatuses(keys)
    if (missing.length === 0) return

    const request = jiraStatusRequests.begin()
    const batches = Array.from({ length: Math.ceil(missing.length / JIRA_ISSUE_STATUS_BATCH_SIZE) }, (_, index) =>
      missing.slice(index * JIRA_ISSUE_STATUS_BATCH_SIZE, (index + 1) * JIRA_ISSUE_STATUS_BATCH_SIZE),
    )
    const statuses = new Map<string, string>()
    const fetchedKeys = new Set<string>()
    for (const batch of batches) {
      if (!jiraStatusRequests.isCurrent(request)) return
      const result = await desktop.jira
        .listIssueStatuses({ requestId: request.requestId, issueKeys: batch })
        .catch(() => undefined)
      if (!result?.ok) break
      batch.forEach((key) => fetchedKeys.add(key))
      result.statuses.forEach((status) => statuses.set(status.key.toUpperCase(), status.statusName))
    }
    if (!jiraStatusRequests.isCurrent(request)) return
    jiraStatusRequests.finish(request)

    const fetchedAt = Date.now()
    for (const key of missing) {
      const statusName = fetchedKeys.has(key) ? statuses.get(key) : undefined
      const previous = jiraStatusCache.get(key)
      jiraStatusCache.set(key, {
        fetchedAt,
        ...((statusName ?? previous?.statusName) ? { statusName: statusName ?? previous?.statusName } : {}),
      })
    }
    updateDisplayedTicketStatuses(keys)
  }
  const filtered = () => filterDeploymentSystems(systems(), view.search, view.availability)
  const TerminalPanel = props.host.terminal?.Panel
  const terminalOpened = () => props.host.terminal?.opened() === true
  const terminalSide = () => props.host.terminal?.placement() === "side"
  const terminalSize = () => (terminalSide() ? view.terminalWidth : view.terminalHeight)
  const terminalMax = () => {
    if (typeof window === "undefined") return terminalSide() ? 800 : 600
    return terminalSide() ? window.innerWidth * 0.65 : window.innerHeight * 0.6
  }
  const narrowed = () => view.search.trim().length > 0 || view.availability !== "all"
  const platformSupported = () => {
    if (fixtureEnabled) return deploymentPlatformSupported(navigator.userAgent)
    if (!deploymentPlatformSupported(navigator.userAgent)) return false
    return (
      view.readiness?.capabilities.find((entry) => entry.capability === "platform_supported")?.status !== "unavailable"
    )
  }
  const fleetReady = () => (fixtureEnabled ? true : view.readiness?.fleetReady)
  const githubNotice = () => (fixtureEnabled ? undefined : deploymentGithubNotice(view.readiness))
  const loading = () => (fixtureEnabled ? fixture === "loading" : view.loading)
  const staleFailure = () => fixture === "stale" || view.staleFailure !== undefined
  const failed = () => fixture === "error" || view.transportFailure || staleFailure()
  const surface = () =>
    deploymentSurface({
      supported: platformSupported(),
      ready: fleetReady(),
      loading: loading(),
      failed: failed(),
      systems: systems(),
      filtered: filtered(),
      narrowed: narrowed(),
    })
  const updatedAge = () => {
    if (fixtureEnabled) return "4m"
    if (!view.fetchedAt) return undefined
    return formatDeploymentAge(Math.max(0, Math.floor((Date.now() - Date.parse(view.fetchedAt)) / 1000)))
  }
  const clearFilters = () => setView({ search: "", availability: "all" })

  const applyWorkspace = (workspace: {
    settings: DeploymentSettings
    readiness: DeploymentReadiness
    systems: readonly DeploymentSystem[]
    fetchedAt?: string
    staleFailure?: DeploymentFailure
  }) => {
    setView({
      settings: workspace.settings,
      readiness: workspace.readiness,
      systems: workspace.systems,
      fetchedAt: workspace.fetchedAt,
      staleFailure: workspace.staleFailure,
      transportFailure: false,
    })
  }

  const bootstrap = async () => {
    const generation = ++bootstrapGeneration
    setView({ loading: true, transportFailure: false, refreshNotice: undefined })
    const result = await desktop.deployments.getWorkspace().catch(() => undefined)
    if (generation !== bootstrapGeneration) return
    if (!result?.ok) {
      setView({ loading: false, transportFailure: true })
      return
    }
    applyWorkspace(result.workspace)
    setView("loading", false)
    void refreshJiraStatuses(result.workspace.systems, true)
    void pollCacheRuns(result.workspace.systems)
    scheduleOperations()
  }

  const pollCacheRuns = async (targets = view.systems) => {
    clearTimeout(cacheTimer)
    const results = await Promise.all(
      targets.map(
        async (system) =>
          [
            system.environment,
            await desktop.deployments.getCacheRun({ environment: system.environment }).catch(() => undefined),
          ] as const,
      ),
    )
    const runs = Object.fromEntries(
      results.flatMap(([environment, result]) => (result?.ok && result.run ? [[environment, result.run]] : [])),
    )
    if (disposed) return
    setView("cacheRuns", runs)
    if (Object.values(runs).some((run) => run.state === "running"))
      cacheTimer = setTimeout(() => void pollCacheRuns(), 1000)
  }

  const refresh = async (force = true, quiet = false) => {
    if (view.refreshing) return
    const request = requests.begin()
    setView({ refreshing: true, refreshNotice: undefined })
    const result = await desktop.deployments
      .listSystems({ requestId: request.requestId, refresh: force })
      .catch(() => undefined)
    if (!requests.isCurrent(request)) return
    requests.finish(request)
    if (!result?.ok) {
      setView({ refreshing: false, transportFailure: true, refreshNotice: "failure" })
      return
    }
    setView({
      refreshing: false,
      readiness: result.readiness,
      systems: result.systems,
      fetchedAt: result.fetchedAt,
      staleFailure: result.staleFailure,
      transportFailure: false,
      refreshNotice: quiet ? undefined : result.staleFailure ? "failure" : "success",
      queuedNotice: view.queuedNotice
        ? {
            ...view.queuedNotice,
            state:
              result.systems.find((system) => system.name === view.queuedNotice?.system)?.operation?.state ??
              view.queuedNotice.state,
          }
        : undefined,
    })
    void refreshJiraStatuses(result.systems, false)
    scheduleOperations()
  }

  const scheduleOperations = () => {
    clearTimeout(operationTimer)
    if (
      disposed ||
      fixtureEnabled ||
      !view.systems.some((system) => system.operation && isBlockingDeploymentOperation(system.operation.state))
    )
      return
    operationTimer = setTimeout(async () => {
      await refresh(false, true)
      scheduleOperations()
    }, 5_000)
  }

  const openDeploy = (system: DeploymentSystem, kind: "deploy" | "reset" | "redeploy") => {
    void dialog.show(() => (
      <DeploymentDialog
        api={fixtureEnabled ? createFixtureDeploymentApi() : desktop.deployments}
        locale={() => props.host.locale()}
        system={system}
        kind={kind}
        onQueued={(operation) => {
          setView({
            queuedNotice: { system: system.name, state: operation.state },
            expanded: operation.environment,
            queuedOperations: { ...view.queuedOperations, [operation.environment]: operation },
            systems: view.systems.map((item) =>
              item.environment === operation.environment ? { ...item, operation, allowedActions: [] } : item,
            ),
          })
          scheduleOperations()
          if (!fixtureEnabled && !isBlockingDeploymentOperation(operation.state)) void refresh(false, true)
        }}
      />
    ))
  }

  const openSettings = () => {
    if (!view.settings || !view.readiness) return
    void dialog.show(() => (
      <DeploymentSettingsDialog
        api={desktop.deployments}
        locale={() => props.host.locale()}
        settings={view.settings!}
        readiness={view.readiness!}
        onSaved={(settings, readiness) => {
          setView({ settings, readiness })
          void refresh(false)
        }}
      />
    ))
  }

  const openAutoSyncOff = (system: DeploymentSystem) => {
    void dialog.show(() => (
      <AutoSyncOffDialog
        t={t}
        system={system}
        run={() =>
          desktop.deployments.setAutoSync({
            environment: system.environment,
            expected: system.autoSync,
            confirmed: true,
          })
        }
        onSuccess={(result) => {
          setView({
            systems: result.systems,
            readiness: result.readiness,
            fetchedAt: result.fetchedAt,
            staleFailure: result.staleFailure,
            refreshNotice: result.staleFailure ? "failure" : "success",
          })
        }}
      />
    ))
  }

  const openClearCache = (system: DeploymentSystem) => {
    const get = async () => ({ ok: true as const, run: fixtureCacheRun })
    const start = async () => {
      fixtureCacheRun = {
        environment: system.environment,
        state: "running" as const,
        output: "Connecting to the fixture host…\nRunning full hard cache flush…\n",
        startedAt: new Date().toISOString(),
      }
      return { ok: true as const, run: fixtureCacheRun }
    }
    const resolve = async () => {
      if (fixtureCacheRun?.state === "unknown") fixtureCacheRun = { ...fixtureCacheRun, state: "resolved" as const }
      return { ok: true as const, run: fixtureCacheRun }
    }
    void dialog.show(() => (
      <CacheDialog
        t={t}
        system={system}
        get={fixtureEnabled ? get : () => desktop.deployments.getCacheRun({ environment: system.environment })}
        start={fixtureEnabled ? start : () => desktop.deployments.startCacheRun({ environment: system.environment })}
        resolve={
          fixtureEnabled
            ? resolve
            : (startedAt) =>
                desktop.deployments.resolveCacheRun({
                  environment: system.environment,
                  startedAt,
                  confirmedEnded: true,
                })
        }
        onUpdate={(run) => setView("cacheRuns", system.environment, run)}
      />
    ))
  }

  const openSsh = (system: DeploymentSystem) => {
    props.host.terminal?.open({
      ...deploymentSshCommand(system.environment),
      title: t("boc.deployments.ssh.title", { system: system.name }),
    })
  }

  onMount(() => {
    const clock = setInterval(() => setNow(Date.now()), 1000)
    if (!fixtureEnabled) void bootstrap()
    else void refreshJiraStatuses(systems(), true)
    jiraStatusTimer = setInterval(() => void refreshJiraStatuses(systems(), true), JIRA_ISSUE_STATUS_CACHE_MS)
    onCleanup(() => {
      bootstrapGeneration += 1
      requests.invalidate()
      clearTimeout(cacheTimer)
      clearTimeout(operationTimer)
      clearInterval(jiraStatusTimer)
      jiraStatusRequests.invalidate()
      clearInterval(clock)
      disposed = true
    })
  })

  return (
    <div
      class="mx-2 mb-[var(--shell-bottom-inset,8px)] mt-[var(--shell-top-inset,8px)] flex min-h-0 flex-1 self-stretch gap-2 overflow-hidden"
      classList={{ "flex-row": terminalSide(), "flex-col": !terminalSide() }}
    >
      <main
        data-boc-screen="deployments"
        aria-busy={loading() || view.refreshing}
        class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[10px] bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-raised)]"
      >
        <header class="flex h-11 shrink-0 items-center gap-3 border-b border-v2-border-border-muted px-4">
          <div class="flex min-w-0 items-baseline gap-2">
            <h1 class="truncate text-[13px] leading-[var(--line-height-compact)] [font-weight:530]">
              {t("boc.deployments.screen.title")}
            </h1>
            <span class="hidden text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-muted sm:inline">
              {t("boc.deployments.screen.subtitle")}
            </span>
          </div>
          <div class="ml-auto flex shrink-0 items-center gap-2 text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-muted">
            <a
              class="underline underline-offset-2"
              href={DEPLOYMENT_ACTIONS_URL}
              onClick={(event) => {
                event.preventDefault()
                props.host.openExternal(DEPLOYMENT_ACTIONS_URL)
              }}
            >
              {t("boc.deployments.progress.github")}
            </a>
            <Show when={fleetReady() === false && systems().length > 0}>
              <span class="text-v2-state-fg-warning">{t("boc.deployments.readiness.degraded")}</span>
              <span aria-hidden="true">·</span>
            </Show>
            <Show when={systems().length > 0}>
              <span>{t("boc.deployments.screen.count", { count: systems().length })}</span>
              <Show when={updatedAge()}>
                {(age) => (
                  <>
                    <span class="hidden md:inline" aria-hidden="true">
                      ·
                    </span>
                    <span class="hidden md:inline">
                      {age() === "<1m"
                        ? t("boc.deployments.screen.updated.now")
                        : t("boc.deployments.screen.updated", { age: age() })}
                    </span>
                  </>
                )}
              </Show>
            </Show>
          </div>
        </header>

        <Show when={surface() !== "unsupported"}>
          <DeploymentsToolbar
            t={t}
            search={view.search}
            availability={view.availability}
            refreshing={view.refreshing}
            live={!fixtureEnabled}
            onSearch={(search) => setView("search", search)}
            onAvailability={(availability) => setView("availability", availability)}
            onRefresh={() => void refresh()}
            onOpenSettings={openSettings}
          />
        </Show>

        <p class="sr-only" role="status" aria-live="polite">
          {view.queuedNotice
            ? t("boc.deployments.deploy.result", {
                system: view.queuedNotice.system,
                state: t(`boc.deployments.operation.${view.queuedNotice.state}`),
              })
            : view.refreshNotice === "success"
              ? t("boc.deployments.refresh.success")
              : view.refreshNotice === "failure"
                ? t("boc.deployments.refresh.failure")
                : ""}
        </p>

        <Show when={view.queuedNotice}>
          {(notice) => (
            <p class="border-b border-v2-border-border-muted px-4 py-2 text-[13px] leading-[var(--line-height-base)]">
              {t("boc.deployments.deploy.result", {
                system: notice().system,
                state: t(`boc.deployments.operation.${notice().state}`),
              })}
            </p>
          )}
        </Show>
        <div data-boc-deployments-body class="flex min-h-0 flex-1 flex-col">
          <Show when={failed() && surface() === "fleet"}>
            <div
              role="status"
              class="flex shrink-0 items-start gap-2 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-2 text-[12px] leading-[var(--line-height-compact)]"
            >
              <Icon name="outline-hexagonal-warning" class="mt-0.5 shrink-0 text-v2-state-fg-warning" />
              <span class="min-w-0 flex-1">
                <strong class="[font-weight:530]">
                  {view.staleFailure?.category === "partial"
                    ? t("boc.deployments.partial.title")
                    : t("boc.deployments.stale.title")}
                </strong>{" "}
                <span class="text-v2-text-text-muted">
                  {view.staleFailure?.category === "partial"
                    ? t("boc.deployments.partial.description")
                    : t("boc.deployments.stale.description")}
                </span>
              </span>
              <Button
                type="button"
                size="small"
                variant="ghost"
                disabled={view.refreshing}
                onClick={() => void refresh()}
              >
                {t("boc.deployments.error.retry")}
              </Button>
            </div>
          </Show>

          <Show when={surface() === "fleet" && githubNotice()} keyed>
            {(notice) => (
              <div
                role="status"
                class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-2 text-[12px] leading-[var(--line-height-compact)]"
              >
                <Icon name="github" class="shrink-0 text-v2-icon-icon-muted" />
                <span class="min-w-0 flex-1">{t(`boc.deployments.githubNotice.${notice}`)}</span>
                <Button type="button" size="small" variant="ghost" onClick={openSettings}>
                  {t("boc.deployments.toolbar.settings")}
                </Button>
              </div>
            )}
          </Show>

          <Show when={surface() === "fleet"}>
            <DeploymentSystemsTable
              t={t}
              systems={filtered()}
              now={now()}
              openExternal={(url) => props.host.openExternal(url)}
              jiraOrigin={jiraOrigin()}
              jiraTicketStatuses={jiraTicketStatuses()}
              settings={view.settings}
              expanded={view.expanded}
              onToggleDetails={(environment) =>
                setView("expanded", view.expanded === environment ? undefined : environment)
              }
              onDeploy={(system) => openDeploy(system, "deploy")}
              onReset={(system) => openDeploy(system, "reset")}
              onRedeploy={(system) => openDeploy(system, "redeploy")}
              onTurnAutoSyncOff={openAutoSyncOff}
              cacheRuns={view.cacheRuns}
              onClearCache={openClearCache}
              onOpenSsh={props.host.terminal ? openSsh : undefined}
            />
          </Show>
          <Show when={surface() === "loading"}>
            <DeploymentSkeleton t={t} />
          </Show>
          <Show when={surface() === "readiness" && view.readiness}>
            {(readiness) => (
              <DeploymentReadinessPanel
                t={t}
                readiness={readiness()}
                retrying={view.refreshing}
                onRetry={() => void refresh()}
                onOpenSettings={openSettings}
              />
            )}
          </Show>
          <Show when={surface() === "unsupported"}>
            <DeploymentState
              icon="circle-exclamation"
              title={t("boc.deployments.screen.unsupported.title")}
              description={t("boc.deployments.screen.unsupported.description")}
            />
          </Show>
          <Show when={surface() === "empty"}>
            <DeploymentState
              icon="server"
              title={t("boc.deployments.empty.title")}
              description={t("boc.deployments.empty.description")}
              action={t("boc.deployments.toolbar.settings")}
              onAction={openSettings}
            />
          </Show>
          <Show when={surface() === "filtered-empty"}>
            <DeploymentState
              icon="magnifying-glass"
              title={t("boc.deployments.filteredEmpty.title")}
              description={t("boc.deployments.filteredEmpty.description")}
              action={t("boc.deployments.toolbar.clear")}
              onAction={clearFilters}
            />
          </Show>
          <Show when={surface() === "error"}>
            <DeploymentState
              icon="circle-exclamation"
              title={t("boc.deployments.error.title")}
              description={t("boc.deployments.error.description")}
              action={t("boc.deployments.error.retry")}
              onAction={() => void (fixtureEnabled ? undefined : bootstrap())}
            />
          </Show>
        </div>
      </main>
      <Show when={terminalOpened()}>
        <aside
          data-boc-deployments-terminal-pane
          data-placement={terminalSide() ? "side" : "bottom"}
          class="relative min-h-0 min-w-0 shrink-0"
          classList={{ "h-full max-w-[65%]": terminalSide(), "w-full max-h-[60%]": !terminalSide() }}
          style={{
            width: terminalSide() ? `${view.terminalWidth}px` : "100%",
            height: terminalSide() ? "100%" : `${view.terminalHeight}px`,
          }}
        >
          <div
            class="absolute z-20"
            classList={{
              "-start-1 top-0 h-full w-2": terminalSide(),
              "-top-1 start-0 h-2 w-full": !terminalSide(),
            }}
          >
            <ResizeHandle
              class="!relative !inset-auto !size-full !transform-none"
              direction={terminalSide() ? "horizontal" : "vertical"}
              edge="start"
              size={terminalSize()}
              min={terminalSide() ? 320 : 160}
              max={terminalMax()}
              collapseThreshold={terminalSide() ? 240 : 100}
              onResize={(size) => setView(terminalSide() ? "terminalWidth" : "terminalHeight", size)}
              onCollapse={() => props.host.terminal?.close()}
            />
          </div>
          {TerminalPanel ? <TerminalPanel /> : null}
        </aside>
      </Show>
    </div>
  )
}

function DeploymentState(props: {
  icon: "circle-exclamation" | "server" | "magnifying-glass"
  title: string
  description: string
  action?: string
  onAction?: () => void
}) {
  return (
    <section class="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center">
      <div class="flex max-w-md flex-col items-center gap-2">
        <Icon name={props.icon} class="mb-1 text-v2-icon-icon-muted" />
        <h2 class="text-[15px] leading-[var(--line-height-base)] [font-weight:530]">{props.title}</h2>
        <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">{props.description}</p>
        <Show when={props.action}>
          {(action) => (
            <Button type="button" size="small" variant="outline" class="mt-2" onClick={props.onAction}>
              {action()}
            </Button>
          )}
        </Show>
      </div>
    </section>
  )
}
