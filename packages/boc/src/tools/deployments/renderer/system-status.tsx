import { Icon } from "@opencode/ui/icon"
import { Tooltip } from "@opencode/ui/tooltip"
import type { DeploymentSystem } from "../domain/systems"

export type StatusTone = "success" | "info" | "warning" | "danger" | "muted"
type StatusIcon = "circle-check" | "warning" | "circle-exclamation" | "info"

export function StatusText(props: { label: string; tone: StatusTone; icon?: StatusIcon }) {
  const toneClasses = {
    "text-v2-state-fg-success": props.tone === "success",
    "text-v2-state-fg-info": props.tone === "info",
    "text-v2-state-fg-warning": props.tone === "warning",
    "text-v2-state-fg-danger": props.tone === "danger",
    "text-v2-text-text-muted": props.tone === "muted",
  }
  if (!props.icon) {
    return (
      <span class="inline-flex items-center gap-1" classList={toneClasses}>
        {props.label}
      </span>
    )
  }
  return (
    <Tooltip value={props.label} placement="top" class="inline-flex">
      <span class="inline-flex items-center" classList={toneClasses}>
        <Icon name={props.icon} size="small" aria-hidden="true" />
        <span class="sr-only">{props.label}</span>
      </span>
    </Tooltip>
  )
}

export function statusIcon(tone: StatusTone): StatusIcon {
  if (tone === "success") return "circle-check"
  if (tone === "warning") return "warning"
  if (tone === "danger") return "circle-exclamation"
  return "info"
}

export function syncTone(sync: DeploymentSystem["sync"]): StatusTone {
  if (sync === "synced") return "success"
  if (sync === "out-of-sync") return "warning"
  return "muted"
}

export function healthTone(health: DeploymentSystem["health"]): StatusTone {
  if (health === "healthy") return "success"
  if (health === "progressing" || health === "suspended") return "warning"
  if (health === "degraded" || health === "missing") return "danger"
  return "muted"
}
