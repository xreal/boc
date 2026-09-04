import { Dynamic } from "solid-js/web"
import { lazy, Show, Suspense, type Component } from "solid-js"
import { byId, type BocExtension, type BocScreenProps } from "../registry"
import type { BocDesktopAPI } from "../desktop/renderer/api"
import { useBocDesktop } from "./desktop"
import { useBocHost } from "./host"
import { createBocTranslator } from "./i18n"

const screens = new Map<string, Component<BocScreenProps>>()

export function BocScreen(props: { id: string }) {
  const host = useBocHost()
  const desktop = useBocDesktop()
  const extension = () => byId(props.id)
  const state = () => bocScreenState(props.id, desktop)
  const t = createBocTranslator(host.locale)

  return (
    <Show
      when={extension()}
      keyed
      fallback={
        <BocScreenState
          state="not-found"
          title={t("boc.extension.notFound.title")}
          description={t("boc.extension.notFound.description")}
        />
      }
    >
      {(extension) => (
        <Show
          when={state() !== "desktop-required"}
          fallback={
            <BocScreenState
              state="desktop-required"
              title={t("boc.extension.desktopRequired.title")}
              description={t("boc.extension.desktopRequired.description")}
            />
          }
        >
          <Suspense fallback={<BocScreenState state="loading" title={t("boc.extension.loading")} />}>
            <Dynamic component={screenFor(extension)} host={host} />
          </Suspense>
        </Show>
      )}
    </Show>
  )
}

export function bocScreenState(id: string, desktop: BocDesktopAPI | undefined) {
  const extension = byId(id)
  if (!extension) return "not-found" as const
  if (extension.desktopOnly && !desktop) return "desktop-required" as const
  return "ready" as const
}

function screenFor(extension: BocExtension) {
  const existing = screens.get(extension.id)
  if (existing) return existing
  const screen = lazy(extension.screen)
  screens.set(extension.id, screen)
  return screen
}

function BocScreenState(props: { state: string; title: string; description?: string }) {
  return (
    <main
      data-boc-state={props.state}
      class="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-v2-text-text-base"
    >
      <div class="flex max-w-md flex-col items-center gap-2 text-center">
        <h1 class="text-[16px] font-medium leading-[var(--line-height-base)]">{props.title}</h1>
        <Show when={props.description}>
          {(description) => (
            <p class="text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-muted">{description()}</p>
          )}
        </Show>
      </div>
    </main>
  )
}
