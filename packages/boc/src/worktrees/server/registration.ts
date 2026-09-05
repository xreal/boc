import { Worktree } from "@opencode-ai/core/worktree"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { define } from "@opencode-ai/plugin/effect/plugin"
import { Effect } from "effect"

export const RIFT_STRATEGY = Worktree.StrategyID.make("boc/rift")

export function riftPlugin(strategy: Worktree.Strategy) {
  return define({
    id: "boc.worktrees",
    effect: (context) =>
      context.worktree
        .transform((editor) => {
          editor.add({
            id: strategy.id,
            create: (input) =>
              strategy.create({
                ...input,
                sourceDirectory: AbsolutePath.make(input.sourceDirectory),
                directory: AbsolutePath.make(input.directory),
              }),
            list: (directory) => strategy.list(AbsolutePath.make(directory)),
            remove: (input) => strategy.remove({ ...input, directory: AbsolutePath.make(input.directory) }),
          })
        })
        .pipe(Effect.asVoid),
  })
}
