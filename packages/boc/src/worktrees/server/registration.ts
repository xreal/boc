import { Worktree } from "@opencode-ai/core/worktree"
import { Context, Effect, Layer } from "effect"

export const RIFT_STRATEGY = Worktree.StrategyID.make("boc/rift")

export function withRiftStrategy(strategy: Worktree.Strategy) {
  return Worktree.node.mapLayer((layer) =>
    layer.pipe(
      Layer.tap((context) => {
        const worktrees = Context.get(context, Worktree.Service)
        return worktrees.register(strategy).pipe(Effect.orDie)
      }),
    ),
  )
}
