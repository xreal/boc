import { createEffect, createMemo, createSignal } from "solid-js"
import {
  parseLaneLastViewed,
  summarizeBoardLanes,
  type JiraBoardIssue,
  type JiraBoardLane,
  type JiraBoardLaneSummary,
} from "../domain/board"

const LANE_LAST_VIEWED_LOOKBACK_MS = 6 * 60 * 60 * 1_000

export function laneLastViewedStorageKey(site: string, boardId: number) {
  return `jira-board-lanes:last-viewed:v1:${site}:${boardId}`
}

export function createJiraBoardLanes(input: {
  issues: () => readonly JiraBoardIssue[]
  site: () => string | undefined
  boardId: () => number | undefined
  lane: () => JiraBoardLane
  ready: () => boolean
}): () => JiraBoardLaneSummary[] {
  const [snapshot, setSnapshot] = createSignal({
    key: undefined as string | undefined,
    values: {} as Partial<Record<JiraBoardLane, number>>,
    firstOpenCutoff: Date.now() - LANE_LAST_VIEWED_LOOKBACK_MS,
  })

  createEffect(() => {
    const key = currentStorageKey(input.site(), input.boardId())
    setSnapshot((current) => {
      if (current.key === key) return current
      return {
        key,
        values: key ? readLaneLastViewed(key) : {},
        firstOpenCutoff: Date.now() - LANE_LAST_VIEWED_LOOKBACK_MS,
      }
    })
  })

  createEffect(() => {
    if (!input.ready()) return
    const key = currentStorageKey(input.site(), input.boardId())
    if (!key) return
    const lane = input.lane()
    const viewedAt = Date.now()
    setSnapshot((current) => {
      const values = current.key === key ? current.values : readLaneLastViewed(key)
      const next = { ...values, [lane]: viewedAt }
      writeLaneLastViewed(key, next)
      return {
        key,
        values: next,
        firstOpenCutoff:
          current.key === key ? current.firstOpenCutoff : Date.now() - LANE_LAST_VIEWED_LOOKBACK_MS,
      }
    })
  })

  return createMemo(() => {
    const current = snapshot()
    return summarizeBoardLanes(input.issues(), current.values, current.firstOpenCutoff)
  })
}

function currentStorageKey(site: string | undefined, boardId: number | undefined) {
  if (!site || boardId === undefined) return
  return laneLastViewedStorageKey(site, boardId)
}

function readLaneLastViewed(storageKey: string): Partial<Record<JiraBoardLane, number>> {
  try {
    return parseLaneLastViewed(JSON.parse(localStorage.getItem(storageKey) ?? "{}"))
  } catch {
    return {}
  }
}

function writeLaneLastViewed(storageKey: string, value: Partial<Record<JiraBoardLane, number>>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Lane badges are a local convenience and may fail safely when storage is unavailable.
  }
}
