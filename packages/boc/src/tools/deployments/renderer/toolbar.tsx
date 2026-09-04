import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { SegmentedControl, SegmentedControlItem } from "@opencode-ai/ui/segmented-control"
import { TextInput } from "@opencode-ai/ui/text-input"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentAvailabilityFilter } from "./surface"

export function DeploymentsToolbar(props: {
  t: BocTranslator
  search: string
  availability: DeploymentAvailabilityFilter
  onSearch: (search: string) => void
  onAvailability: (availability: DeploymentAvailabilityFilter) => void
}) {
  return (
    <div
      data-boc-deployments-toolbar
      class="flex shrink-0 flex-wrap items-center gap-2 border-b border-v2-border-border-muted px-4 py-2.5"
    >
      <TextInput
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
        <Tooltip value={props.t("boc.deployments.action.unavailable")} placement="bottom">
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.deployments.toolbar.refresh")}
            disabled
            icon={<Icon name="reset" />}
          />
        </Tooltip>
        <Tooltip value={props.t("boc.deployments.action.unavailable")} placement="bottom">
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            aria-label={props.t("boc.deployments.toolbar.settings")}
            disabled
            icon={<Icon name="settings-gear" />}
          />
        </Tooltip>
      </div>
    </div>
  )
}
