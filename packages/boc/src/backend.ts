export * as BocBackend from "./backend"

import { App } from "@opencode-ai/core/app"
import { Database } from "@opencode-ai/core/database/database"
import { LocationServiceMap } from "@opencode-ai/core/location-service-map"
import { Plugin } from "@opencode-ai/core/plugin"
import { SdkPlugins } from "@opencode-ai/core/plugin/sdk"
import { Worktree } from "@opencode-ai/core/worktree"
import { WorktreeTable } from "@opencode-ai/core/worktree/sql"
import { define } from "@opencode-ai/plugin/effect/plugin"
import { BocWorktreeRpc } from "@opencode-ai/schema/boc/worktree-rpc"
import { BocEnvironmentRpc } from "@opencode-ai/schema/boc/environment-rpc"
import { RIFT_BACKEND_VERSION, type RiftCapability } from "@opencode-ai/schema/boc/rift"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { and, eq } from "drizzle-orm"
import { Cause, Context, Effect, Layer } from "effect"
import path from "node:path"
import { BocEnvironments, EnvironmentBackendService } from "./environments/runtime"
import { BocWorktrees } from "./worktrees/server/runtime"
import { RiftBackendService } from "./worktrees/server/backend"

export class Service extends Context.Service<Service, {}>()("@boc/BackendRpc") {}

export const node = makeGlobalNode({
  service: Service,
  layer: Layer.effect(
    Service,
    Effect.gen(function* () {
      const app = yield* App.Metadata
      if (app.channel !== "boc") return {}
      const plugins = yield* SdkPlugins.Service
      const rift = yield* RiftBackendService
      const environments = yield* EnvironmentBackendService
      const database = yield* Database.Service
      const locations = yield* LocationServiceMap.Service
      const scope = yield* Effect.scope

      yield* plugins.register(
        define({
          id: "boc.backend",
          effect: (context) =>
            Effect.gen(function* () {
              yield* context.rpc.register(BocWorktreeRpc.Rpc, {
                info: () => Effect.succeed({ protocol: 1 as const }),
                prepare: (input) =>
                  Effect.gen(function* () {
                    const origin = {
                      directory: AbsolutePath.make(context.location.directory),
                      workspaceID: context.location.workspaceID,
                    }
                    const preparation = rift.preparations.begin(input.operationID, origin)
                    if (!preparation.started) return { ...preparation.state }
                    // Own both the worker and its Location lease in the process-global scope.
                    // Disposing the calling plugin/request must not interrupt checkout creation.
                    yield* Effect.gen(function* () {
                      const active = yield* Plugin.Service
                      const worktrees = yield* Worktree.Service
                      yield* active.awaitActivation
                      const created = yield* worktrees.create(
                        input.worktree,
                        rift.preparations.progress(input.operationID),
                      )
                      rift.preparations.succeed(input.operationID, created.directory)
                    }).pipe(
                      Effect.provide(locations.get(origin)),
                      Effect.catchCause((cause) =>
                        Effect.sync(() => rift.preparations.fail(input.operationID, Cause.pretty(cause))),
                      ),
                      Effect.forkIn(scope),
                    )
                    return { ...preparation.state }
                  }),
                preparation: (input) => Effect.sync(() => rift.preparations.read(input.operationID) ?? null),
                riftCapability: (input) =>
                  Effect.gen(function* () {
                    const source = yield* database.db
                      .select({ directory: WorktreeTable.directory })
                      .from(WorktreeTable)
                      .where(
                        and(eq(WorktreeTable.project_id, input.projectID), eq(WorktreeTable.directory, input.source)),
                      )
                      .get()
                      .pipe(Effect.orDie)
                    if (!source) return unavailable("The selected source is not registered for this project.")
                    if (path.resolve(input.directory) !== path.dirname(input.source)) {
                      return unavailable("Rift checkouts must use the project's sibling storage location.")
                    }
                    return yield* Effect.promise(() => rift.capability(input.directory))
                  }),
                riftTrash: () => Effect.promise(rift.trash),
                cleanupRiftTrash: () => Effect.promise(rift.cleanup),
              })
              yield* context.rpc.register(BocEnvironmentRpc.Rpc, {
                info: () => Effect.succeed({ protocol: 1 as const }),
                inspect: (input) => Effect.promise(() => environments.inspect(input.projectID, input.directory)),
                run: (input) => Effect.promise(() => environments.run(input)),
                cancel: (input) => Effect.promise(() => environments.cancel(input.projectID, input.directory)),
              })
            }).pipe(Effect.orDie),
        }),
      )
      return {}
    }),
  ),
  deps: [App.node, SdkPlugins.node, Database.node, LocationServiceMap.node, BocWorktrees.node, BocEnvironments.node],
})

function unavailable(message: string): RiftCapability {
  return { available: false, backend: "boc/rift", version: RIFT_BACKEND_VERSION, reason: "project-mismatch", message }
}
