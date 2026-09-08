import type { State } from "@opencode-ai/schema/boc/worktree-preparation"
import type { Session } from "@opencode-ai/schema/session"
import type { WorktreeProgress } from "@opencode-ai/core/boc/worktree-progress"
import { AbsolutePath } from "@opencode-ai/schema/schema"

const LOG_LIMIT = 64 * 1024
const HISTORY_LIMIT = 100

type MutableState = {
  -readonly [Key in keyof State]: State[Key]
}

export function createWorktreePreparations() {
  const operations = new Map<Session.ID, MutableState>()

  const read = (operationID: Session.ID) => operations.get(operationID)
  const begin = (operationID: Session.ID) => {
    const existing = read(operationID)
    if (existing) return { started: false as const, state: existing }

    const now = Date.now()
    const state: MutableState = {
      operationID,
      status: "running",
      phase: "queued",
      startedAt: now,
      updatedAt: now,
      log: "",
      truncated: false,
    }
    operations.set(operationID, state)
    trimHistory()
    return { started: true as const, state }
  }

  const progress = (operationID: Session.ID): WorktreeProgress.Reporter => ({
    phase(value) {
      const state = read(operationID)
      if (!state || state.status !== "running") return
      state.phase = value
      state.updatedAt = Date.now()
    },
    output(value) {
      const state = read(operationID)
      if (!state || state.status !== "running" || !value) return
      const next = Buffer.from(state.log + value)
      if (next.byteLength <= LOG_LIMIT) {
        state.log = next.toString("utf8")
      } else {
        state.log = next.subarray(next.byteLength - LOG_LIMIT).toString("utf8")
        state.truncated = true
      }
      state.updatedAt = Date.now()
    },
  })

  const succeed = (operationID: Session.ID, directory: string) => {
    const state = read(operationID)
    if (!state || state.status !== "running") return
    const now = Date.now()
    state.status = "succeeded"
    state.directory = AbsolutePath.make(directory)
    state.updatedAt = now
    state.endedAt = now
  }

  const fail = (operationID: Session.ID, error: string) => {
    const state = read(operationID)
    if (!state || state.status !== "running") return
    const now = Date.now()
    state.status = "failed"
    state.error = error
    state.updatedAt = now
    state.endedAt = now
  }

  const trimHistory = () => {
    if (operations.size <= HISTORY_LIMIT) return
    const completed = Array.from(operations.values())
      .filter((operation) => operation.status !== "running")
      .sort((left, right) => left.updatedAt - right.updatedAt)
    completed.slice(0, operations.size - HISTORY_LIMIT).forEach((operation) => operations.delete(operation.operationID))
  }

  return { begin, read, progress, succeed, fail }
}

export type WorktreePreparations = ReturnType<typeof createWorktreePreparations>
