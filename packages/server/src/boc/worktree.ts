import { RIFT_BACKEND_VERSION, type RiftCapabilityResult } from "@boc/extensions/worktrees/shared"
import { RiftBackendService } from "@boc/extensions/worktrees/server"
import { Worktree } from "@opencode-ai/core/worktree"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import path from "node:path"
import { Api } from "../api"

export const BocWorktreeHandler = HttpApiBuilder.group(Api, "server.boc.worktree", (handlers) =>
  Effect.gen(function* () {
    const rift = yield* RiftBackendService
    const worktrees = yield* Worktree.Service

    return handlers.handle("boc.worktree.riftCapability", (context) =>
      Effect.gen(function* () {
        if (!rift.enabled) {
          return unavailable("backend-unavailable", "This server does not provide Boc Rift checkouts.")
        }
        const directories = yield* worktrees.list(context.params.projectID)
        if (!directories.some((item) => item.directory === context.query.source)) {
          return unavailable("project-mismatch", "The selected source is not registered for this project.")
        }
        if (path.resolve(context.query.directory) !== path.dirname(context.query.source)) {
          return unavailable("project-mismatch", "Rift checkouts must use the project's sibling storage location.")
        }
        return yield* Effect.promise(() => rift.capability(context.query.directory))
      }),
    )
  }),
)

function unavailable(
  reason: Extract<RiftCapabilityResult, { available: false }>["reason"],
  message: string,
): RiftCapabilityResult {
  return { available: false, backend: "boc/rift", version: RIFT_BACKEND_VERSION, reason, message }
}
