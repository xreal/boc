import type { OpenCodeClient, WorktreeCreateInput } from "@opencode-ai/client/promise"

export async function prepareWorktree(input: {
  api: Pick<OpenCodeClient, "server.boc.worktree">
  location: string
  operationID: string
  worktree: Pick<WorktreeCreateInput, "strategy" | "from" | "branch" | "directory">
}) {
  const preparations = input.api["server.boc.worktree"]
  const started = await preparations.prepare({
    location: { directory: input.location },
    operationID: input.operationID,
    worktree: input.worktree,
  })
  const completed = await waitForPreparation(preparations, started)
  if (completed.status === "succeeded" && completed.directory) return { directory: completed.directory }
  if (completed.error) throw new Error(completed.error)
  throw completed
}

async function waitForPreparation(
  preparations: OpenCodeClient["server.boc.worktree"],
  started: Awaited<ReturnType<OpenCodeClient["server.boc.worktree"]["prepare"]>>,
) {
  if (started.status !== "running") return started
  await Bun.sleep(300)
  const current = await preparations.preparation({ operationID: started.operationID })
  if (!current) throw started
  return waitForPreparation(preparations, current)
}
