import type { OpenCodeClient, WorktreeCreateInput } from "@opencode-ai/client/promise"
import { BocWorktreeRpc } from "@opencode-ai/schema/boc/worktree-rpc"
import type { State } from "@opencode-ai/schema/boc/worktree-preparation"

export async function prepareWorktree(input: {
  api: Pick<OpenCodeClient, "rpc">
  location: string
  operationID: string
  worktree: Pick<WorktreeCreateInput, "strategy" | "from" | "branch" | "directory">
}) {
  const preparations = input.api.rpc(BocWorktreeRpc.Rpc)
  const options = { location: { directory: input.location } }
  const started = await preparations.prepare(
    {
      operationID: input.operationID,
      worktree: input.worktree,
    },
    options,
  )
  const completed = await waitForPreparation(
    () => preparations.preparation({ operationID: input.operationID }, options),
    started,
  )
  if (completed.status === "succeeded" && completed.directory) return { directory: completed.directory }
  if (completed.error) throw new Error(completed.error)
  throw completed
}

async function waitForPreparation(inspect: () => Promise<State | null>, started: State) {
  if (started.status !== "running") return started
  await new Promise((resolve) => setTimeout(resolve, 300))
  const current = await inspect()
  if (!current) throw started
  return waitForPreparation(inspect, current)
}
