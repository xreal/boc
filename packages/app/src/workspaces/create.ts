import type { LocationGetOutput, OpenCodeClient } from "@opencode-ai/client/promise"
import type { Data } from "@opencode-ai/client/solid"
import { getDirectory } from "@opencode-ai/util/path"

type WorktreeCreation = {
  api: Pick<OpenCodeClient, "location" | "server.boc.worktree" | "worktree">
  project: LocationGetOutput["project"]
  branch?: string
  directory: string
}

export type WorktreeStrategyResolver = (input: WorktreeCreation) => Promise<string | undefined>

export async function createWorktree(input: {
  api: Pick<OpenCodeClient, "location" | "server.boc.worktree" | "worktree">
  data: Pick<Data, "location">
  directory: string
  project?: LocationGetOutput["project"]
  branch?: string
  strategy?: WorktreeStrategyResolver
}) {
  const project = input.project ?? (await input.api.location.get({ location: { directory: input.directory } })).project
  const directory = getDirectory(project.canonical)
  const strategy = (await input.strategy?.({ api: input.api, project, branch: input.branch, directory })) ?? "git"
  const created = await input.api.worktree.create({
    projectID: project.id,
    strategy,
    from: project.canonical,
    branch: input.branch,
    directory,
  })
  // Populate the client cache before the destination session mounts.
  await input.data.location.syncInfo({ directory: created.directory })
  return created.directory
}
