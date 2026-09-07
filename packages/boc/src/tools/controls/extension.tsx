import type { BocExtension } from "../../registry"

export const controlsExtension = {
  id: "controls",
  title: "boc.bergflow.title",
  icon: "sliders",
  screen: () => import("./renderer/screen"),
  commands: [
    {
      id: "boc.controls.session",
      title: "boc.bergflow.openSession",
      run: (host) => {
        void host.controls?.openSession()
      },
    },
  ],
} satisfies BocExtension
