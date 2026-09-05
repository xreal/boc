export * as BocWorktrees from "./runtime"

import { App } from "@opencode-ai/core/app"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Effect, Layer } from "effect"
import { createRiftBackend, RiftBackendService } from "./backend"
import { riftPlugin } from "./registration"

export const node = makeGlobalNode({
  service: RiftBackendService,
  layer: Layer.effect(
    RiftBackendService,
    Effect.gen(function* () {
      const app = yield* App.Metadata
      const enabled = app.channel === "boc"
      const backend = createRiftBackend()
      if (enabled) {
        const plugins = yield* SdkPlugins.Service
        yield* plugins.register(riftPlugin(backend.strategy))
      }
      return RiftBackendService.of({ enabled, ...backend })
    }),
  ),
  deps: [App.node, SdkPlugins.node],
})
