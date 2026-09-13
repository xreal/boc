export * as BocBackend from "./backend"

import { App } from "@opencode/core/app"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { define } from "@opencode/plugin/effect/plugin"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer } from "effect"
import { registerEnvironmentAgent } from "./environments/agent"
import { BocEnvironments, EnvironmentBackendService } from "./environments/runtime"

export class Service extends Context.Service<Service, {}>()("@boc/BackendRpc") {}

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const app = yield* App.Metadata
      if (app.channel !== "boc") return {}
      const plugins = yield* SdkPlugins.Service
      const environments = yield* EnvironmentBackendService

      yield* plugins.register(
        define({
          id: "boc.backend",
          effect: (context) =>
            Effect.gen(function* () {
              yield* registerEnvironmentAgent(context, environments)
              yield* context.rpc.register(BocEnvironmentRpc.Rpc, {
                info: () => Effect.succeed({ protocol: 2 as const }),
                inspect: (input) => Effect.promise(() => environments.inspect(input.projectID, input.directory)),
                run: (input) => Effect.promise(() => environments.run(input)),
                cancel: (input) => Effect.promise(() => environments.cancel(input.projectID, input.directory)),
                logs: (input) => Effect.promise(() => environments.logs(input)),
                resize: (input) => Effect.promise(() => environments.resize(input)),
              })
            }).pipe(Effect.orDie),
        }),
      )
      return {}
    }),
  ),
  deps: [App.node, SdkPlugins.node, BocEnvironments.node],
})
