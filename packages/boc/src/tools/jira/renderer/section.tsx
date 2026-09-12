import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Loader } from "@opencode/ui/loader"
import { Tooltip } from "@opencode/ui/tooltip"
import { Show, type JSX } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"

export function JiraSection(props: {
  t: BocTranslator
  title: string
  count?: string
  loading: boolean
  online: boolean
  onRefresh: () => void
  children: JSX.Element
}) {
  return (
    <section aria-label={props.title} class="flex flex-col gap-3 border-t border-v2-border-border-muted pt-4">
      <div class="flex h-6 items-center gap-2">
        <h3 class="min-w-0 flex-1 text-[12px] leading-[var(--line-height-compact)] text-v2-text-text-muted [font-weight:530]">
          {props.title}
        </h3>
        <span class="text-[12px] text-v2-text-text-faint">{props.count}</span>
        <Show when={props.loading}>
          <span aria-label={props.t("boc.jira.collaboration.refreshing")}>
            <Loader class="size-3" />
          </span>
        </Show>
        <Tooltip value={props.t("boc.jira.collaboration.refresh", { section: props.title })}>
          <IconButton
            size="small"
            variant="ghost-muted"
            icon={<Icon name="refresh" />}
            disabled={!props.online || props.loading}
            aria-label={props.t("boc.jira.collaboration.refresh", { section: props.title })}
            onClick={props.onRefresh}
          />
        </Tooltip>
      </div>
      {props.children}
    </section>
  )
}
