export type JiraTone = "neutral" | "info" | "success" | "warning" | "danger"

export const jiraToneText = {
  neutral: "text-v2-text-text-muted",
  info: "text-v2-state-fg-info",
  success: "text-v2-state-fg-success",
  warning: "text-v2-state-fg-warning",
  danger: "text-v2-state-fg-danger",
} as const satisfies Record<JiraTone, string>

export function jiraPriorityTone(name?: string): JiraTone {
  const value = name?.trim().toLowerCase() ?? ""
  if (["highest", "blocker", "critical", "urgent"].includes(value)) return "danger"
  if (["high", "major"].includes(value)) return "warning"
  if (["low", "lowest", "minor", "trivial"].includes(value)) return "info"
  return "neutral"
}
