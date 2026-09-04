import type { BocExtension } from "../../../registry"

export const exampleExtension = {
  id: "example",
  title: "boc.title",
  icon: "status",
  screen: () => import("./screen"),
  commands: [
    {
      id: "boc.example.refresh",
      title: "boc.title",
      run: () => undefined,
    },
  ],
} satisfies BocExtension
