import { Project } from "@opencode-ai/schema/project"
import { RiftCapability, RiftCleanupResult, RiftTrashSummary } from "@opencode-ai/schema/boc/rift"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

export const BocWorktreeGroup = HttpApiGroup.make("server.boc.worktree")
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
