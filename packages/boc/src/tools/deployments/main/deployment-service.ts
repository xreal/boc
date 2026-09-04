import { deploymentFailure, type DeploymentFailure } from "../domain/failures"
import type { DeploymentSystem } from "../domain/systems"
import type {
  DeploymentCapabilityStatus,
  DeploymentReadiness,
  DeploymentSettings,
  DeploymentSettingsResult,
  DeploymentSystemsReadInput,
  DeploymentSystemsResult,
  DeploymentWorkspaceResult,
} from "../rpcs"
import { readArgoFleet, type ArgoCliRuntime } from "./argo-cli"
import type { DeploymentCommandRunner } from "./command-runner"
import {
  autoSyncCapability,
  createDeploymentReadiness,
  validateDeploymentSettings,
  type DeploymentFileExists,
} from "./readiness"
import { normalizeDeploymentSettings, readDeploymentSettings, type DeploymentStore } from "./store"

export const DEPLOYMENT_FLEET_CACHE_MS = 30_000

export type DeploymentRuntime = {
  store: DeploymentStore
  run: DeploymentCommandRunner
  platform: NodeJS.Platform
  now?: () => number
  fileExists?: DeploymentFileExists
}

type FleetSnapshot = {
  systems: readonly DeploymentSystem[]
  readiness: DeploymentReadiness
  fetchedAt: string
  generation: number
}

type FreshFleet =
  | { ok: true; snapshot: FleetSnapshot; staleFailure?: DeploymentFailure }
  | {
      ok: false
      failure: DeploymentFailure
      readiness: DeploymentReadiness
    }

type FleetFlight = {
  generation: number
  controller: AbortController
  readers: Set<symbol>
  promise: Promise<FreshFleet>
}

export function createDeploymentService(runtime: DeploymentRuntime) {
  const now = runtime.now ?? Date.now
  const argo: ArgoCliRuntime = { run: runtime.run, platform: runtime.platform }
  let generation = 0
  let cache: FleetSnapshot | undefined
  let flight: FleetFlight | undefined

  const readFresh = async (settings: DeploymentSettings, targetGeneration: number, signal: AbortSignal) => {
    const [argoResult, autoSync] = await Promise.all([
      readArgoFleet(argo, settings, signal),
      autoSyncCapability(settings, runtime.fileExists),
    ])
    const readiness = createDeploymentReadiness({
      ...argoResult.statuses,
      bf_deploy_auto_sync: withoutCapability(autoSync),
    })
    if (!argoResult.ok) return { ok: false as const, failure: argoResult.failure, readiness }

    const snapshot = {
      systems: argoResult.systems,
      readiness,
      fetchedAt: new Date(now()).toISOString(),
      generation: targetGeneration,
    }
    const staleFailure = argoResult.rejected
      ? deploymentFailure("partial", {
          capability: "argocd_list_applications",
          context: { rejected: argoResult.rejected },
        })
      : undefined
    if (generation === targetGeneration) cache = snapshot
    return { ok: true as const, snapshot, ...(staleFailure ? { staleFailure } : {}) }
  }

  const beginRead = (settings: DeploymentSettings) => {
    if (flight?.generation === generation) return flight
    const controller = new AbortController()
    const targetGeneration = generation
    const readers = new Set<symbol>()
    const promise = readFresh(settings, targetGeneration, controller.signal).finally(() => {
      if (flight?.controller === controller) flight = undefined
    })
    const current: FleetFlight = {
      generation: targetGeneration,
      controller,
      readers,
      promise,
    }
    flight = current
    return current
  }

  const joinRead = (current: FleetFlight, signal?: AbortSignal): Promise<FreshFleet> => {
    const reader = Symbol()
    current.readers.add(reader)
    if (!signal) {
      return current.promise.finally(() => current.readers.delete(reader))
    }
    if (signal.aborted) {
      current.readers.delete(reader)
      if (!current.readers.size) current.controller.abort()
      return Promise.resolve(cancelledReadiness())
    }

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: FreshFleet) => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", cancel)
        current.readers.delete(reader)
        resolve(result)
      }
      const cancel = () => {
        finish(cancelledReadiness())
        if (!current.readers.size) current.controller.abort()
      }
      signal.addEventListener("abort", cancel, { once: true })
      void current.promise.then(finish)
    })
  }

  const listSystems = async (
    input: DeploymentSystemsReadInput,
    signal?: AbortSignal,
  ): Promise<DeploymentSystemsResult> => {
    const settings = readDeploymentSettings(runtime.store)
    if (
      !input.refresh &&
      cache !== undefined &&
      cache.generation === generation &&
      now() - Date.parse(cache.fetchedAt) < DEPLOYMENT_FLEET_CACHE_MS
    ) {
      return {
        ok: true,
        systems: cache.systems,
        readiness: cache.readiness,
        fetchedAt: cache.fetchedAt,
      }
    }

    const result = await joinRead(beginRead(settings), signal)
    if (result.ok) {
      return {
        ok: true as const,
        systems: result.snapshot.systems,
        readiness: result.snapshot.readiness,
        fetchedAt: result.snapshot.fetchedAt,
        ...(result.staleFailure ? { staleFailure: result.staleFailure } : {}),
      }
    }
    if (result.failure.category === "cancelled") return result.failure
    return {
      ok: true as const,
      systems: cache?.systems ?? [],
      readiness: result.readiness,
      ...(cache ? { fetchedAt: cache.fetchedAt } : {}),
      staleFailure: result.failure,
    }
  }

  const invalidate = () => {
    generation += 1
    cache = undefined
    flight?.controller.abort()
    flight = undefined
  }

  return {
    getSettings: () => readDeploymentSettings(runtime.store),
    async saveSettings(settings: DeploymentSettings): Promise<DeploymentSettingsResult> {
      const normalized = normalizeDeploymentSettings(settings)
      const failure = validateDeploymentSettings(normalized)
      if (failure) return failure
      runtime.store.writeSettings(normalized)
      invalidate()
      const result = await listSystems({ requestId: "settings", refresh: true })
      return {
        ok: true as const,
        settings: normalized,
        readiness: result.ok ? result.readiness : createDeploymentReadiness({}),
      }
    },
    listSystems,
    async getWorkspace(): Promise<DeploymentWorkspaceResult> {
      const result = await listSystems({ requestId: "workspace", refresh: false })
      if (!result.ok) return result
      return {
        ok: true as const,
        workspace: {
          settings: readDeploymentSettings(runtime.store),
          readiness: result.readiness,
          systems: result.systems,
          operations: [],
          ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
          ...(result.staleFailure ? { staleFailure: result.staleFailure } : {}),
        },
      }
    },
    async checkReadiness() {
      const result = await listSystems({ requestId: "readiness", refresh: true })
      return result.ok ? result.readiness : createDeploymentReadiness({})
    },
    invalidate,
  }
}

export type DeploymentService = ReturnType<typeof createDeploymentService>

function cancelledReadiness(): FreshFleet {
  return {
    ok: false,
    failure: deploymentFailure("cancelled", { capability: "argocd_list_applications" }),
    readiness: createDeploymentReadiness({}),
  }
}

function withoutCapability(status: DeploymentCapabilityStatus) {
  return {
    status: status.status,
    ...(status.failure ? { failure: status.failure } : {}),
    ...(status.context ? { context: status.context } : {}),
  }
}
