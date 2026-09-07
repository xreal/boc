export * as BocBergflow from "./server"

import { App } from "@opencode-ai/core/app"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Effect, Layer, Schema } from "effect"

export const node = makeGlobalNode({
  name: "boc-bergflow",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const app = yield* App.Metadata
      if (app.channel !== "boc") return
      const plugins = yield* SdkPlugins.Service
      yield* plugins.register(
        {
          id: "bergflow",
          effect: (context) =>
            Effect.gen(function* () {
              // Import only the selected fallback, inside the normal plugin failure boundary.
              const artifact = yield* Effect.promise(() => import("@bergflow/opencode"))
              const { PluginModule } = yield* Effect.promise(() => import("@opencode-ai/core/plugin/module"))
              const { PluginPromise } = yield* Effect.promise(() => import("@opencode-ai/core/plugin/promise"))
              const bergflow = yield* Schema.decodeUnknownEffect(PluginModule.Module)(artifact).pipe(Effect.orDie)
              if (bergflow.default.id !== "bergflow")
                return yield* Effect.die(new Error("Bundled Bergflow plugin ID does not match its registration"))
              const plugin =
                "effect" in bergflow.default ? bergflow.default : PluginPromise.fromPromise(bergflow.default)
              yield* plugin.effect(context)
            }),
        },
        { fallback: true },
      )
    }),
  ),
  deps: [App.node, SdkPlugins.node],
})
