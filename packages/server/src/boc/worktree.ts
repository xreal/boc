import { RiftBackendService } from "@boc/extensions/worktrees/server"
import { Database } from "@opencode-ai/core/database/database"
import { WorktreeTable } from "@opencode-ai/core/worktree/sql"
import { RIFT_BACKEND_VERSION, type RiftCapability as RiftCapabilityResult } from "@opencode-ai/schema/boc/rift"
import { Effect } from "effect"
import { and, eq } from "drizzle-orm"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import path from "node:path"
import { Api } from "../api"

export const BocWorktreeHandler = HttpApiBuilder.group(Api, "server.boc.worktree", (handlers) =>
  Effect.gen(function* () {
    const rift = yield* RiftBackendService
    const database = yield* Database.Service

    return handlers
      .handle("boc.worktree.riftCapability", (context) =>
        Effect.gen(function* () {
          if (!rift.enabled) {
            return unavailable("backend-unavailable", "This server does not provide Boc Rift checkouts.")
          }
          const source = yield* database.db
            .select({ directory: WorktreeTable.directory })
            .from(WorktreeTable)
            .where(
              and(
                eq(WorktreeTable.project_id, context.params.projectID),
                eq(WorktreeTable.directory, context.query.source),
              ),
            )
            .get()
            .pipe(Effect.orDie)
          if (!source) {
            return unavailable("project-mismatch", "The selected source is not registered for this project.")
          }
          if (path.resolve(context.query.directory) !== path.dirname(context.query.source)) {
            return unavailable("project-mismatch", "Rift checkouts must use the project's sibling storage location.")
          }
          return yield* Effect.promise(() => rift.capability(context.query.directory))
        }),
      )
      .handle("boc.worktree.riftTrash", () =>
        rift.enabled ? Effect.promise(rift.trash) : Effect.succeed({ checkouts: 0 }),
      )
      .handle("boc.worktree.cleanupRiftTrash", () =>
        rift.enabled ? Effect.promise(rift.cleanup) : Effect.succeed({ completed: false as const, checkouts: 0 }),
      )
  }),
)

function unavailable(
  reason: Extract<RiftCapabilityResult, { available: false }>["reason"],
  message: string,
): RiftCapabilityResult {
  return { available: false, backend: "boc/rift", version: RIFT_BACKEND_VERSION, reason, message }
}
