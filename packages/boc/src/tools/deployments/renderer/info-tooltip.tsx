import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import type { BocTranslator } from "../../../renderer/i18n"

export function DeploymentInfo(props: { t: BocTranslator; topic: string; value: string }) {
  return (
    <Tooltip value={props.value} placement="top" contentClass="max-w-72">
      <IconButton
        type="button"
        variant="ghost-muted"
        size="small"
        icon={<Icon name="info" size="small" />}
        aria-label={props.t("boc.deployments.info", { topic: props.topic })}
      />
    </Tooltip>
  )
}
