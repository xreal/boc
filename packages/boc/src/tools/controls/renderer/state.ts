import { BocControls } from "@opencode/schema/boc/controls"
import { Schema, Option } from "effect"
import type { ControlItem, ControlState } from "../host"
import { createEffect, createMemo, onCleanup, onMount, untrack } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import type { ControlsHost, ControlsSelection } from "../host"

export type ControlError =
  | "missing"
  | "disabled"
  | "unsupported"
  | "unavailable"
  | "conflict"
  | "persistence"
  | "unknown"
  | "reconciled"
  | "rejected"
  | "connection"
type Snapshot = Omit<ControlState, "items"> & { items: Array<ControlItem & { key: string }> }

export function createProjectControls(host: ControlsHost, initial?: ControlsSelection) {
  const [view, setView] = createStore({
    initialized: false,
    selection: undefined as ControlsSelection | undefined,
    snapshot: undefined as Snapshot | undefined,
    loading: false,
    stale: false,
    pending: undefined as string | undefined,
    error: undefined as ControlError | undefined,
    rowError: undefined as { key: string; error: ControlError } | undefined,
  })
  let autoSelect = true
  let closed = false
  let epoch = 0
  let reading: AbortController | undefined
  let writing: AbortController | undefined
  let refreshAfterWrite = false
  const connection = createMemo(() => (view.selection ? host.connect(view.selection.server) : undefined))
  const adopt = (snapshot: ControlState) =>
    setView(
      "snapshot",
      reconcile(
        { ...snapshot, items: snapshot.items.map((item) => ({ ...item, key: `${item.kind}:${item.id}` })) },
        { key: "key" },
      ),
    )

  const refresh = async () => {
    if (view.pending) {
      refreshAfterWrite = true
      return
    }
    const selected = view.selection
    const transport = connection()
    if (!selected || !transport || transport.status() !== "connected") return
    const current = ++epoch
    reading?.abort()
    reading = new AbortController()
    const identity = transport.identity()
    const client = transport.client()
    const options = {
      location: { directory: selected.directory },
      signal: AbortSignal.any([reading.signal, AbortSignal.timeout(15_000)]),
    }
    setView("loading", true)
    try {
      const info = await client.info({}, options)
      if (!info.operations.includes("getState")) throw { type: "unsupported" }
      const state = await client.getState({}, options)
      if (current !== epoch || identity !== transport.identity()) return
      if (state.info.project.id !== info.project.id || state.info.location.directory !== info.location.directory)
        throw { type: "unsupported" }
      adopt(state)
      setView({ stale: false, error: view.error === "unknown" ? "reconciled" : undefined })
    } catch (error) {
      if (current !== epoch) return
      setView({ stale: true, error: failure(error) })
    } finally {
      if (current === epoch) setView("loading", false)
    }
  }

  const select = (selection: ControlsSelection) => {
    if (view.pending) return false
    const project = { ...selection, directory: selection.project }
    autoSelect = false
    epoch++
    reading?.abort()
    setView({ selection: project, snapshot: undefined, error: undefined, rowError: undefined, stale: false })
    host.remember(project)
    return true
  }

  onMount(async () => {
    const saved = initial ?? (await host.initial())
    if (closed) return
    if (saved && autoSelect) select(saved)
    setView("initialized", true)
  })
  createEffect(() => {
    if (!autoSelect || !view.initialized || view.selection) return
    const projects = host.servers().flatMap((server) =>
      server.projects.map((project) => ({
        server: server.key,
        project: project.directory,
        directory: project.directory,
      })),
    )
    const project = projects.length === 1 ? projects[0] : undefined
    if (project) untrack(() => select(project))
  })
  createEffect(() => {
    const selected = view.selection
    const transport = connection()
    const status = transport?.status()
    // Re-run when the connection identity, attempt, or status changes.
    transport?.attempt()
    transport?.identity()
    untrack(() => {
      epoch++
      reading?.abort()
      writing?.abort()
      const interrupted = view.pending !== undefined
      setView({
        loading: false,
        pending: undefined,
        stale: !!view.snapshot,
        ...(interrupted ? { error: "unknown" as const } : {}),
      })
      if (!selected) return
      if (!transport) {
        setView({ error: "unavailable", stale: true })
        return
      }
      if (status === "connected") {
        void refresh()
        return
      }
      setView("error", interrupted ? "unknown" : "unavailable")
    })
  })
  createEffect(() => {
    const transport = connection()
    if (!transport) return
    onCleanup(
      transport.subscribe((event) => {
        const changed = Schema.decodeUnknownOption(BocControls.Rpc.events.changed.schema)(event)
        if (Option.isNone(changed) || changed.value.projectID !== view.snapshot?.info.project.id) return
        if (view.pending) {
          refreshAfterWrite = true
          return
        }
        void refresh()
      }),
    )
  })
  onCleanup(() => {
    closed = true
    epoch++
    reading?.abort()
    writing?.abort()
  })

  const mutate = async (
    item: ControlItem & { key: string },
    action: "set" | "clear" | "retry" | "connect",
    enabled?: boolean,
  ) => {
    const selected = view.selection
    const snapshot = view.snapshot
    const transport = connection()
    if (!selected || !snapshot || !transport || view.stale || view.pending || transport.status() !== "connected") return
    const current = ++epoch
    reading?.abort()
    const identity = transport.identity()
    const target = { kind: item.kind, id: item.id, expectedRevision: snapshot.revision }
    writing = new AbortController()
    const options = {
      location: { directory: selected.directory },
      signal: AbortSignal.any([writing.signal, AbortSignal.timeout(15_000)]),
    }
    const client = transport.client()
    setView({ pending: item.key, loading: false, rowError: undefined, error: undefined })
    try {
      if (action === "connect") {
        await host.connectMcp?.(selected, item.id)
      }
      const result =
        action === "connect"
          ? await client.getState({}, options)
          : action === "clear"
            ? await client.clearOverride(target, options)
            : action === "retry"
              ? await client.retryApply(target, options)
              : await client.setEnabled({ ...target, enabled: enabled === true }, options)
      if (current !== epoch || identity !== transport.identity()) return
      if (
        result.info.project.id !== snapshot.info.project.id ||
        result.info.location.directory !== snapshot.info.location.directory
      )
        throw { type: "unsupported" }
      adopt(result)
    } catch (error) {
      if (current !== epoch) return
      const kind = action === "connect" ? "connection" : failure(error, true)
      setView({ rowError: { key: item.key, error: kind }, ...(kind === "unknown" ? { error: kind, stale: true } : {}) })
      refreshAfterWrite = true
    } finally {
      if (current === epoch) {
        setView("pending", undefined)
        if (refreshAfterWrite) {
          refreshAfterWrite = false
          await refresh()
        }
      }
    }
  }
  const clear = () => {
    if (view.pending) return
    autoSelect = false
    epoch++
    reading?.abort()
    setView({
      selection: undefined,
      snapshot: undefined,
      loading: false,
      stale: false,
      error: undefined,
      rowError: undefined,
    })
  }
  return { view, select, clear, refresh, mutate }
}

function failure(error: unknown, mutation = false): ControlError {
  const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined
  if (type === "conflict") return "conflict"
  if (type === "persistence_failed") return "persistence"
  if (type === "rpc.unavailable") return "missing"
  if (type === "unsupported" || (typeof error === "object" && error !== null && "issues" in error)) return "unsupported"
  if (type === "not_supported" || type === "unknown_capability") return "rejected"
  return mutation ? "unknown" : "unavailable"
}
