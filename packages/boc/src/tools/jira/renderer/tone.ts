import type { JiraColumnGroup } from "../domain/board"

export type JiraTone = "neutral" | "info" | "success" | "warning" | "danger"

export const jiraToneText = {
  neutral: "text-v2-text-text-muted",
  info: "text-v2-state-fg-info",
  success: "text-v2-state-fg-success",
  warning: "text-v2-state-fg-warning",
  danger: "text-v2-state-fg-danger",
} as const satisfies Record<JiraTone, string>

export const jiraToneDot = {
  neutral: "bg-v2-icon-icon-faint",
  info: "bg-v2-state-fg-info",
  success: "bg-v2-state-fg-success",
  warning: "bg-v2-state-fg-warning",
  danger: "bg-v2-state-fg-danger",
} as const satisfies Record<JiraTone, string>

// Board configurations only expose status ids, so the column position stands in for the Jira status category.
export function jiraColumnTone(groups: readonly JiraColumnGroup[], index: number): JiraTone {
  const group = groups[index]
  if (!group || group.column.id === "unmapped") return "warning"
  const mapped = groups.filter((entry) => entry.column.id !== "unmapped")
  if (index === 0) return "neutral"
  if (index === mapped.length - 1) return "success"
  return "info"
}

export function jiraPriorityTone(name?: string): JiraTone {
  const value = name?.trim().toLowerCase() ?? ""
  if (["highest", "blocker", "critical", "urgent"].includes(value)) return "danger"
  if (["high", "major"].includes(value)) return "warning"
  if (["low", "lowest", "minor", "trivial"].includes(value)) return "info"
  return "neutral"
}
