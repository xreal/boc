import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { SegmentedControl, SegmentedControlItem } from "@opencode/ui/segmented-control"
import { TextInput } from "@opencode/ui/text-input"
import { Tooltip } from "@opencode/ui/tooltip"
import { onCleanup, onMount } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentAvailabilityFilter } from "./surface"

export function DeploymentsToolbar(props: {
  t: BocTranslator
  search: string
  availability: DeploymentAvailabilityFilter
  onSearch: (search: string) => void
  onAvailability: (availability: DeploymentAvailabilityFilter) => void
  refreshing: boolean
  live: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}) {
  let searchInput: HTMLInputElement | undefined

  onMount(() => {
    const find = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "f") return
      if (!searchInput?.isConnected || document.querySelector('dialog[open], [role="dialog"]')) return
      event.preventDefault()
      event.stopPropagation()
      searchInput.focus()
      searchInput.select()
    }
    window.addEventListener("keydown", find, { capture: true })
    onCleanup(() => window.removeEventListener("keydown", find, { capture: true }))
  })

  return (
    <div
      data-boc-deployments-toolbar
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-v2-border-border-muted px-4 py-2.5"
    >
      <TextInput
        ref={searchInput}
        aria-label={props.t("boc.deployments.toolbar.search.label")}
        class="!w-[min(22rem,100%)]"
        name="deployment-system-search"
        autocomplete="off"
        spellcheck={false}
        placeholder={props.t("boc.deployments.toolbar.search.placeholder")}
        value={props.search}
        leadingIcon={<Icon name="magnifying-glass" />}
        showClearButton={props.search.length > 0}
        clearLabel={props.t("boc.deployments.toolbar.clear")}
        onClearClick={() => props.onSearch("")}
        onInput={(event) => props.onSearch(event.currentTarget.value)}
      />

      <SegmentedControl
        class="!w-64"
        aria-label={props.t("boc.deployments.toolbar.filter.label")}
        value={props.availability}
        onChange={(value) => {
          if (value === "all" || value === "free" || value === "occupied") props.onAvailability(value)
        }}
      >
        <SegmentedControlItem value="all">{props.t("boc.deployments.toolbar.filter.all")}</SegmentedControlItem>
        <SegmentedControlItem value="free">{props.t("boc.deployments.toolbar.filter.free")}</SegmentedControlItem>
        <SegmentedControlItem value="occupied">
          {props.t("boc.deployments.toolbar.filter.occupied")}
        </SegmentedControlItem>
      </SegmentedControl>

      <div class="ml-auto flex items-center gap-1">
        <Tooltip
          value={props.t(props.live ? "boc.deployments.toolbar.refresh" : "boc.deployments.action.unavailable")}
          placement="bottom"
        >
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.deployments.toolbar.refresh")}
            disabled={!props.live || props.refreshing}
            onClick={props.onRefresh}
            icon={<Icon name="reset" classList={{ "animate-spin motion-reduce:animate-none": props.refreshing }} />}
          />
        </Tooltip>
        <Tooltip
          value={props.t(props.live ? "boc.deployments.toolbar.settings" : "boc.deployments.action.unavailable")}
          placement="bottom"
        >
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.deployments.toolbar.settings")}
            disabled={!props.live}
            onClick={props.onOpenSettings}
            icon={<Icon name="outline-sliders" />}
          />
        </Tooltip>
      </div>
    </div>
  )
}
