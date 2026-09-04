import { Project } from "@opencode-ai/schema/project"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { RiftCapability } from "./capability.js"

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
  .annotateMerge(OpenApi.annotations({ title: "boc", description: "Boc-specific backend capabilities." }))
