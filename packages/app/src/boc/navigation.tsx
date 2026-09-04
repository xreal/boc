import { Popover } from "@kobalte/core/popover"
import { bocExtensions, createBocTranslator, type BocExtension, type BocTranslator } from "@boc/extensions/renderer"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createBocHost } from "./host"

export function BocNavigationBridge(props: { orientation: "horizontal" | "vertical" }) {
  const host = createBocHost()
  const t = createBocTranslator(host.locale)
  const open = (extension: BocExtension) => host.navigate(`/boc/${extension.id}`)
  const active = (extension: BocExtension) => {
    const route = host.route()
    return route.type === "boc" && "id" in route && route.id === extension.id
  }

  if (props.orientation === "vertical") {
    return (
      <For each={bocExtensions}>
        {(extension) => (
          <button
            type="button"
            data-action={`vertical-tabs-boc-${extension.id}`}
            class="group flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-faint hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base"
            classList={{ "bg-v2-background-bg-layer-02 text-v2-text-text-base": active(extension) }}
            onClick={() => open(extension)}
            onMouseEnter={() => void extension.screen()}
            onFocus={() => void extension.screen()}
            aria-current={active(extension) ? "page" : undefined}
            aria-label={t(extension.title)}
          >
            <Icon name={extension.icon} />
            <span class="min-w-0 truncate">{t(extension.title)}</span>
          </button>
        )}
      </For>
    )
  }

  return (
    <Show when={bocExtensions.length === 1} fallback={<ExtensionMenu open={open} active={active} t={t} />}>
      <Tooltip placement="bottom" value={t(bocExtensions[0].title)} class="shrink-0">
        <IconButton
          type="button"
          variant="ghost-muted"
          size="large"
          class="!w-9 shrink-0"
          classList={{ "bg-v2-background-bg-layer-02": active(bocExtensions[0]) }}
          icon={<Icon name={bocExtensions[0].icon} />}
          onClick={() => open(bocExtensions[0])}
          onMouseEnter={() => void bocExtensions[0].screen()}
          onFocus={() => void bocExtensions[0].screen()}
          aria-current={active(bocExtensions[0]) ? "page" : undefined}
          aria-label={t(bocExtensions[0].title)}
        />
      </Tooltip>
    </Show>
  )
}

function ExtensionMenu(props: {
  open: (extension: BocExtension) => void
  active: (extension: BocExtension) => boolean
  t: BocTranslator
}) {
  const [state, setState] = createStore({ open: false })

  return (
    <Popover open={state.open} onOpenChange={(open) => setState("open", open)} placement="bottom-start" gutter={6}>
      <Popover.Trigger
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-[6px] text-v2-icon-icon-muted outline-none hover:bg-v2-background-bg-layer-02 hover:text-v2-icon-icon-base focus-visible:ring-1 focus-visible:ring-v2-border-focus"
        aria-label={props.t("boc.title")}
      >
        <Icon name="status" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content class="z-50 flex min-w-44 flex-col gap-0.5 rounded-[10px] bg-v2-background-bg-base p-1.5 shadow-[var(--v2-elevation-floating)] outline-none">
          <For each={bocExtensions}>
            {(extension) => (
              <button
                type="button"
                class="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] leading-[var(--line-height-compact)] text-v2-text-text-base hover:bg-v2-background-bg-layer-02"
                classList={{ "bg-v2-background-bg-layer-02": props.active(extension) }}
                onClick={() => {
                  props.open(extension)
                  setState("open", false)
                }}
                onMouseEnter={() => void extension.screen()}
                onFocus={() => void extension.screen()}
                aria-current={props.active(extension) ? "page" : undefined}
              >
                <Icon name={extension.icon} />
                <span>{props.t(extension.title)}</span>
              </button>
            )}
          </For>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  )
}
