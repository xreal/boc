import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocScreenProps } from "../../../registry"
import { createBocTranslator } from "../../../renderer/i18n"
import { deploymentSystemFixtures } from "../fixtures/systems"
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

export default function DeploymentsScreen(props: BocScreenProps) {
  const t = createBocTranslator(() => props.host.locale())
  const [view, setView] = createStore({
    search: "",
    availability: "all" as DeploymentAvailabilityFilter,
    expanded: undefined as string | undefined,
  })
  const fixture = () => deploymentFixtureMode(props.host.location().search)
  const systems = () =>
    fixture() === "empty" || fixture() === "error" || fixture() === "loading" ? [] : deploymentSystemFixtures
  const filtered = () => filterDeploymentSystems(systems(), view.search, view.availability)
  const narrowed = () => view.search.trim().length > 0 || view.availability !== "all"
  const supported = () => deploymentPlatformSupported(navigator.userAgent)
  const surface = () =>
    deploymentSurface({
      supported: supported(),
      loading: fixture() === "loading",
      failed: fixture() === "error" || fixture() === "stale",
      systems: systems(),
      filtered: filtered(),
      narrowed: narrowed(),
    })
  const clearFilters = () => setView({ search: "", availability: "all" })

  return (
    <main
      data-boc-screen="deployments"
      aria-busy={surface() === "loading"}
      class="mx-2 mb-[var(--shell-bottom-inset,8px)] mt-[var(--shell-top-inset,8px)] flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base text-v2-text-text-base shadow-[var(--v2-elevation-raised)]"
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
          <span>{t("boc.deployments.screen.preview")}</span>
          <Show when={systems().length > 0}>
            <span aria-hidden="true">·</span>
            <span>{t("boc.deployments.screen.count", { count: systems().length })}</span>
            <span class="hidden md:inline" aria-hidden="true">
              ·
            </span>
            <span class="hidden md:inline">{t("boc.deployments.screen.updated", { age: "4m" })}</span>
          </Show>
        </div>
      </header>

      <Show when={surface() !== "unsupported"}>
        <DeploymentsToolbar
          t={t}
          search={view.search}
          availability={view.availability}
          onSearch={(search) => setView("search", search)}
          onAvailability={(availability) => setView("availability", availability)}
        />
      </Show>

      <div data-boc-deployments-body class="flex min-h-0 flex-1 flex-col">
        <Show when={fixture() === "stale" && surface() === "fleet"}>
          <div
            role="status"
            class="flex shrink-0 items-start gap-2 border-b border-v2-border-border-muted bg-v2-background-bg-layer-01 px-4 py-2 text-[12px] leading-[var(--line-height-compact)]"
          >
            <Icon name="outline-hexagonal-warning" class="mt-0.5 shrink-0 text-v2-state-fg-warning" />
            <span>
              <strong class="[font-weight:530]">{t("boc.deployments.stale.title")}</strong>{" "}
              <span class="text-v2-text-text-muted">{t("boc.deployments.stale.description")}</span>
            </span>
          </div>
        </Show>

        <Show when={surface() === "fleet"}>
          <DeploymentSystemsTable
            t={t}
            systems={filtered()}
            expanded={view.expanded}
            onToggleDetails={(environment) =>
              setView("expanded", view.expanded === environment ? undefined : environment)
            }
          />
        </Show>
        <Show when={surface() === "loading"}>
          <DeploymentSkeleton t={t} />
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
            disabledReason={t("boc.deployments.action.unavailable")}
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
            disabledReason={t("boc.deployments.action.unavailable")}
          />
        </Show>
      </div>
    </main>
  )
}

function DeploymentState(props: {
  icon: "circle-exclamation" | "server" | "magnifying-glass"
  title: string
  description: string
  action?: string
  onAction?: () => void
  disabledReason?: string
}) {
  return (
    <section class="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center">
      <div class="flex max-w-md flex-col items-center gap-2">
        <Icon name={props.icon} class="mb-1 text-v2-icon-icon-muted" />
        <h2 class="text-[15px] leading-[var(--line-height-base)] [font-weight:530]">{props.title}</h2>
        <p class="text-[13px] leading-[var(--line-height-base)] text-v2-text-text-muted">{props.description}</p>
        <Show when={props.action}>
          {(action) => (
            <Button
              type="button"
              size="small"
              variant="outline"
              class="mt-2"
              disabled={!props.onAction}
              title={!props.onAction ? props.disabledReason : undefined}
              onClick={props.onAction}
            >
              {action()}
            </Button>
          )}
        </Show>
        <Show when={props.action && !props.onAction && props.disabledReason}>
          {(reason) => (
            <p class="text-[11px] leading-[var(--line-height-compact)] text-v2-text-text-faint">{reason()}</p>
          )}
        </Show>
      </div>
    </section>
  )
}
