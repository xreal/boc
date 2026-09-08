import { Project } from "@opencode-ai/schema/project"
import { RiftCapability, RiftCleanupResult, RiftTrashSummary } from "@opencode-ai/schema/boc/rift"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { StartInput, State as PreparationState } from "@opencode-ai/schema/boc/worktree-preparation"
import { Session } from "@opencode-ai/schema/session"
import { Context, Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "../groups/location.js"

export const makeBocWorktreeGroup = <I extends HttpApiMiddleware.AnyId, S>(locationMiddleware: Context.Key<I, S>) =>
  HttpApiGroup.make("server.boc.worktree")
    .add(
      HttpApiEndpoint.post("boc.worktree.prepare", "/api/boc/worktree/prepare", {
        query: LocationQuery,
        payload: StartInput,
        success: PreparationState,
      })
        .annotateMerge(locationQueryOpenApi)
        .middleware(locationMiddleware)
        .annotateMerge(
          OpenApi.annotations({
            identifier: "v2.boc.worktree.prepare",
            summary: "Prepare a checkout with live progress",
            description: "Start checkout creation in the background and retain bounded command output for inspection.",
          }),
        ),
    )
    .add(
      HttpApiEndpoint.get("boc.worktree.preparation", "/api/boc/worktree/preparation/:operationID", {
        params: { operationID: Session.ID },
        success: Schema.NullOr(PreparationState),
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.boc.worktree.preparation",
          summary: "Inspect checkout preparation progress",
          description: "Read the latest phase and bounded command output for a checkout operation.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("boc.worktree.riftCapability", "/api/boc/worktree/:projectID/rift-capability", {
        params: { projectID: Project.ID },
        query: { source: AbsolutePath, directory: AbsolutePath },
        success: RiftCapability,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.boc.worktree.riftCapability",
          summary: "Inspect Rift checkout capability",
          description: "Check whether the Boc backend can create a Rift checkout for a registered project source.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.get("boc.worktree.riftTrash", "/api/boc/worktree/rift-trash", {
        success: RiftTrashSummary,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.boc.worktree.riftTrash",
          summary: "Inspect Rift trash",
          description: "Count deleted Boc Rift checkouts whose storage has not been reclaimed.",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("boc.worktree.cleanupRiftTrash", "/api/boc/worktree/rift-trash/cleanup", {
        success: RiftCleanupResult,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "v2.boc.worktree.cleanupRiftTrash",
          summary: "Clean Rift trash",
          description: "Reclaim storage from every deleted checkout in Boc's private Rift registry.",
        }),
      ),
    )
    .annotateMerge(OpenApi.annotations({ title: "boc", description: "Boc-specific backend capabilities." }))
