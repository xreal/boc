import { RiftBackendService } from "@boc/extensions/worktrees/server"
import { Database } from "@opencode-ai/core/database/database"
import { Plugin } from "@opencode-ai/core/plugin"
import { Worktree } from "@opencode-ai/core/worktree"
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
      .handle("boc.worktree.prepare", (context) =>
        Effect.gen(function* () {
          const operationID = context.payload.operationID
          const plugins = yield* Plugin.Service
          const worktrees = yield* Worktree.Service
          yield* plugins.awaitActivation
          const preparation = rift.preparations.begin(operationID)
          if (!preparation.started) return { ...preparation.state }
          yield* worktrees.create(context.payload.worktree, rift.preparations.progress(operationID)).pipe(
            Effect.tap((created) => Effect.sync(() => rift.preparations.succeed(operationID, created.directory))),
            Effect.catch((error) =>
              Effect.sync(() =>
                rift.preparations.fail(
                  operationID,
                  error instanceof Error ? error.message : "Checkout preparation failed.",
                ),
              ),
            ),
            Effect.forkDetach,
          )
          return { ...preparation.state }
        }),
      )
      .handle("boc.worktree.preparation", (context) =>
        Effect.succeed(rift.preparations.read(context.params.operationID) ?? null),
      )
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
