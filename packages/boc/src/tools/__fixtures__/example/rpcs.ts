import { Effect, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const BocExamplePing = Rpc.make("BocExamplePing", { success: Schema.Literal("pong") })
export const ExampleRpcs = RpcGroup.make(BocExamplePing)
export const exampleHandlers = ExampleRpcs.toLayer(
  ExampleRpcs.of({
    BocExamplePing: () => Effect.succeed("pong" as const),
  }),
)
