import type { BocExtension } from "../../registry"

export const jiraExtension = {
  id: "jira",
  title: "boc.jira.title",
  icon: "status",
  desktopOnly: true,
  screen: () => import("./renderer/screen"),
} satisfies BocExtension
