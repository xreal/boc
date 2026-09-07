import type { BocExtension } from "../../registry"

export const bergflowExtension = {
  id: "bergflow",
  title: "boc.bergflow.title",
  icon: "sliders",
  screen: () => import("./renderer/screen"),
  commands: [
    {
      id: "boc.bergflow.session",
      title: "boc.bergflow.openSession",
      run: (host) => {
        void host.controls?.openSession()
      },
    },
  ],
} satisfies BocExtension
