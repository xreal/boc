import type { IconProps } from "@opencode/ui/icon"
import type { Component } from "solid-js"
import type { BocI18nKey } from "./renderer/i18n"
import type { BocHost } from "./renderer/host"
import { controlsExtension } from "./tools/controls/extension"
import { deploymentsExtension } from "./tools/deployments/extension"
import { jiraExtension } from "./tools/jira/extension"

export type BocCommand = {
  id: `boc.${string}`
  title: BocI18nKey
  run: (host: BocHost) => void
}

export type BocScreenProps = {
  host: BocHost
}

export type BocExtension = {
  id: string
  title: BocI18nKey
  icon: IconProps["name"]
  screen: () => Promise<{ default: Component<BocScreenProps> }>
  commands?: readonly BocCommand[]
  desktopOnly?: boolean
}

export const bocExtensions: readonly BocExtension[] = [jiraExtension, deploymentsExtension, controlsExtension]

export function byId(id: string): BocExtension | undefined {
  const current = id === "bergflow" ? "controls" : id
  return bocExtensions.find((extension) => extension.id === current)
}
