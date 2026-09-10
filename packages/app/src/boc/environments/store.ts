import type { BocEnvironment } from "@opencode/schema/boc/environment"
import type { environmentApi } from "./api"
import { onCleanup } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { pathKey } from "@/workspaces/path-key"

type EnvironmentApi = ReturnType<typeof environmentApi>
type EnvironmentAction = NonNullable<BocEnvironment.State["latestRun"]>["action"]
type OperationRejection = "operation-running" | "not-available" | "not-configured" | "confirmation-required"

export type EnvironmentResource = ReturnType<typeof createEnvironmentResource>
export type EnvironmentResourceInput = {
  server: string
  projectID: string
  directory: string
  api: () => EnvironmentApi
  refreshDelayMs?: number
}
export type EnvironmentRegistry = {
  acquire: (input: EnvironmentResourceInput) => EnvironmentResource
  release: (resource: EnvironmentResource) => void
  size: () => number
  dispose: () => void
}

export function createEnvironmentResource(input: EnvironmentResourceInput) {
  const [state, setState] = createStore<{
    environment?: BocEnvironment.State
    loading: boolean
    refreshing: boolean
    failed: boolean
    stale: boolean
    acting?: EnvironmentAction | "cancel"
    rejection?: OperationRejection
  }>({ loading: false, refreshing: false, failed: false, stale: false })
  const lifecycle = {
    observers: 0,
    panels: 0,
    revision: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  }
  let pending: Promise<void> | undefined

  const clearRefresh = () => {
    if (lifecycle.timer === undefined) return
    clearTimeout(lifecycle.timer)
    lifecycle.timer = undefined
  }

  const scheduleRefresh = () => {
    clearRefresh()
    const running = state.environment?.latestRun?.status === "running"
    if (lifecycle.panels === 0 && (lifecycle.observers === 0 || !running)) return
    lifecycle.timer = setTimeout(
      () => {
        lifecycle.timer = undefined
        void inspect()
      },
      input.refreshDelayMs ?? (running ? 1_200 : 5_000),
    )
  }

  const apply = (environment: BocEnvironment.State) => {
    setState("environment", reconcile(structuredClone(environment)))
    setState({ loading: false, refreshing: false, failed: false, stale: false, rejection: undefined })
    scheduleRefresh()
  }

  const inspect = () => {
    if (pending) return pending
    const revision = lifecycle.revision
    setState({ loading: !state.environment, refreshing: !!state.environment, failed: false })
    pending = input
      .api()
      .inspect({ projectID: input.projectID, directory: input.directory })
      .then((environment) => {
        if (revision === lifecycle.revision) apply(environment)
      })
      .catch(() => {
        if (revision !== lifecycle.revision) return
        setState({ loading: false, refreshing: false, failed: true, stale: !!state.environment })
        scheduleRefresh()
      })
      .finally(() => {
        pending = undefined
      })
    return pending
  }

  const run = async (
    action: EnvironmentAction,
    sessionID: string,
    options?: { domain?: string; confirmation?: "remove-environment"; containerID?: string },
  ) => {
    if (state.acting) return false
    lifecycle.revision += 1
    setState({ acting: action, failed: false, rejection: undefined })
    return input
      .api()
      .run({
        projectID: input.projectID,
        directory: input.directory,
        sessionID,
        action,
        domain: options?.domain,
        confirmation: options?.confirmation,
        containerID: options?.containerID,
      })
      .then((result) => {
        lifecycle.revision += 1
        apply(result.environment)
        if (!result.accepted) {
          setState("rejection", result.reason)
          return false
        }
        return true
      })
      .catch(() => {
        lifecycle.revision += 1
        setState({ failed: true, stale: !!state.environment })
        return false
      })
      .finally(() => setState("acting", undefined))
  }

  const cancel = async () => {
    if (state.acting) return false
    lifecycle.revision += 1
    setState({ acting: "cancel", failed: false, rejection: undefined })
    return input
      .api()
      .cancel({ projectID: input.projectID, directory: input.directory })
      .then((result) => {
        lifecycle.revision += 1
        apply(result.environment)
        return result.cancelled
      })
      .catch(() => {
        lifecycle.revision += 1
        setState({ failed: true, stale: !!state.environment })
        return false
      })
      .finally(() => setState("acting", undefined))
  }

  return {
    key: `${input.server}\0${input.projectID}\0${pathKey(input.directory)}`,
    state,
    inspect,
    run,
    cancel,
    logs: (containerID: string) =>
      input.api().logs({ projectID: input.projectID, directory: input.directory, containerID }),
    resize: (runID: string, cols: number, rows: number) =>
      input.api().resize({ projectID: input.projectID, directory: input.directory, runID, cols, rows }),
    watchStatus() {
      lifecycle.panels += 1
      void inspect()
      return () => {
        lifecycle.panels = Math.max(0, lifecycle.panels - 1)
        scheduleRefresh()
      }
    },
    observe() {
      lifecycle.observers += 1
      scheduleRefresh()
    },
    unobserve() {
      lifecycle.observers = Math.max(0, lifecycle.observers - 1)
      if (lifecycle.observers === 0) clearRefresh()
    },
    observed: () => lifecycle.observers > 0,
    dispose: clearRefresh,
  }
}

export function createEnvironmentRegistry(): EnvironmentRegistry {
  const resources = new Map<string, EnvironmentResource>()
  return {
    acquire(input: EnvironmentResourceInput) {
      const key = `${input.server}\0${input.projectID}\0${pathKey(input.directory)}`
      const resource = resources.get(key) ?? createEnvironmentResource(input)
      resources.set(key, resource)
      resource.observe()
      return resource
    },
    release(resource: EnvironmentResource) {
      resource.unobserve()
      if (!resource.observed()) resources.delete(resource.key)
    },
    size: () => resources.size,
    dispose() {
      resources.forEach((resource) => resource.dispose())
      resources.clear()
    },
  }
}

const environmentRegistry = createEnvironmentRegistry()

export function useEnvironmentResource(input: EnvironmentResourceInput) {
  const resource = environmentRegistry.acquire(input)
  onCleanup(() => environmentRegistry.release(resource))
  return resource
}
