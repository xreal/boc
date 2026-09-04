import type { BocExtension } from "../../registry"

export const deploymentsExtension = {
  id: "deployments",
  title: "boc.deployments.title",
  icon: "server",
  desktopOnly: true,
  screen: () => import("./renderer/screen"),
} satisfies BocExtension
