import { isReservedDevEnvironment, type AllowedDevEnvironment } from "../domain/environments"
import { deploymentFailure, type DeploymentFailure } from "../domain/failures"
import {
  isBlockingDeploymentOperation,
  pruneDeploymentHistory,
  type DeploymentOperationState,
  type DeploymentOperationSummary,
  type DeploymentWorkflowOperation,
} from "../domain/operations"
import { deploymentTicketKey, type DeploymentSystem } from "../domain/systems"
import {
  normalizeDeploymentWorkflowInputs,
  PREFERRED_DEPLOYMENT_WORKFLOW,
  RESET_DEPLOYMENT_REF,
  resetDeploymentWorkflowInputs,
  type DeploymentWorkflowFilename,
  type DeploymentWorkflowInputValue,
} from "../domain/workflows"
import type {
  DeploymentCapabilityStatus,
  DeploymentDraft,
  DeploymentPreparedKind,
  DeploymentPreparedPlan,
  DeploymentReadiness,
  DeploymentSettings,
  DeploymentSettingsResult,
  DeploymentSystemsReadInput,
  DeploymentSystemsResult,
  DeploymentWorkspaceResult,
} from "../rpcs"
import { readArgoFleet, verifyArgoDevTarget, type ArgoCliRuntime } from "./argo-cli"
import type { DeploymentCommandRunner } from "./command-runner"
import {
  DEPLOYMENT_WORKFLOW_CACHE_MS,
  dispatchGithubWorkflow,
  githubReadiness,
  listGithubBranches,
  listGithubWorkflowTargets,
  validateGithubRef,
  type GithubWorkflowTarget,
} from "./github-cli"
import {
  autoSyncCapability,
  createDeploymentReadiness,
  validateDeploymentSettings,
  type DeploymentFileExists,
} from "./readiness"
import {
  normalizeDeploymentSettings,
  readDeploymentOperations,
  readDeploymentSettings,
  type DeploymentStore,
} from "./store"

export const DEPLOYMENT_FLEET_CACHE_MS = 30_000
export const DEPLOYMENT_PREPARED_PLAN_TTL_MS = 5 * 60 * 1000

export type DeploymentRuntime = {
  store: DeploymentStore
  run: DeploymentCommandRunner
  platform: NodeJS.Platform
  now?: () => number
  createId?: () => string
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

type StoredPreparedPlan = {
  public: DeploymentPreparedPlan
  bound: ReadonlyArray<{
    filename: DeploymentWorkflowFilename
    inputs: Readonly<Record<string, DeploymentWorkflowInputValue>>
  }>
  expiresAt: number
}

export function createDeploymentService(runtime: DeploymentRuntime) {
  const now = runtime.now ?? Date.now
  const createId = runtime.createId ?? crypto.randomUUID.bind(crypto)
  const argo: ArgoCliRuntime = { run: runtime.run, platform: runtime.platform }
  const github = { run: runtime.run }
  let generation = 0
  let cache: FleetSnapshot | undefined
  let flight: FleetFlight | undefined
  let workflowCache:
    | { generation: number; fetchedAt: number; ref?: string; targets: readonly GithubWorkflowTarget[] }
    | undefined
  const prepared = new Map<string, StoredPreparedPlan>()
  const preparing = new Map<AllowedDevEnvironment, symbol>()
  const dispatching = new Set<AllowedDevEnvironment>()
  let writes = Promise.resolve()

  const operations = () => readDeploymentOperations(runtime.store, now())

  const persistOperations = (
    update: (current: readonly DeploymentOperationSummary[]) => readonly DeploymentOperationSummary[],
  ) => {
    const write = writes.then(() => {
      runtime.store.writeOperations(pruneDeploymentHistory(update(operations()), now()))
    })
    writes = write.catch(() => undefined)
    return write
  }

  const blockingOperation = (environment: AllowedDevEnvironment) =>
    operations().find(
      (operation) => operation.environment === environment && isBlockingDeploymentOperation(operation.state),
    )

  const attachSystems = (systems: readonly DeploymentSystem[], readiness: DeploymentReadiness) =>
    systems.map((system) => {
      const operation = blockingOperation(system.environment)
      const allowed = readiness.deploymentReady && !operation ? (["deploy", "reset"] as const) : []
      return {
        ...system,
        ...(operation ? { operation } : {}),
        allowedActions: [...allowed],
      }
    })

  const readFresh = async (settings: DeploymentSettings, targetGeneration: number, signal: AbortSignal) => {
    const [argoResult, autoSync, githubResult] = await Promise.all([
      readArgoFleet(argo, settings, signal),
      autoSyncCapability(settings, runtime.fileExists),
      githubReadiness(github, signal),
    ])
    const readiness = createDeploymentReadiness({
      ...argoResult.statuses,
      ...githubResult.statuses,
      bf_deploy_auto_sync: withoutCapability(autoSync),
    })
    if (!argoResult.ok) return { ok: false as const, failure: argoResult.failure, readiness }

    const snapshot = {
      systems: attachSystems(argoResult.systems, readiness),
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
      const readiness = cache.readiness
      return {
        ok: true,
        systems: attachSystems(cache.systems, readiness),
        readiness,
        fetchedAt: cache.fetchedAt,
      }
    }

    const result = await joinRead(beginRead(settings), signal)
    if (result.ok) {
      return {
        ok: true as const,
        systems: attachSystems(result.snapshot.systems, result.snapshot.readiness),
        readiness: result.snapshot.readiness,
        fetchedAt: result.snapshot.fetchedAt,
        ...(result.staleFailure ? { staleFailure: result.staleFailure } : {}),
      }
    }
    if (result.failure.category === "cancelled") return result.failure
    return {
      ok: true as const,
      systems: attachSystems(cache?.systems ?? [], result.readiness),
      readiness: result.readiness,
      ...(cache ? { fetchedAt: cache.fetchedAt } : {}),
      staleFailure: result.failure,
    }
  }

  const invalidatePrepared = () => {
    prepared.clear()
    preparing.clear()
  }

  const invalidate = () => {
    generation += 1
    cache = undefined
    workflowCache = undefined
    invalidatePrepared()
    flight?.controller.abort()
    flight = undefined
  }

  const requireGithub = async (signal?: AbortSignal) => {
    const result = await githubReadiness(github, signal)
    if (!result.ok) return result.failure
    return undefined
  }

  const loadWorkflowTargets = async (refresh: boolean, ref?: string, signal?: AbortSignal) => {
    if (
      !refresh &&
      workflowCache &&
      workflowCache.generation === generation &&
      workflowCache.ref === ref &&
      now() - workflowCache.fetchedAt < DEPLOYMENT_WORKFLOW_CACHE_MS
    ) {
      return { ok: true as const, targets: workflowCache.targets }
    }
    const result = await listGithubWorkflowTargets(github, ref, signal)
    if (!result.ok) return result
    workflowCache = { generation, fetchedAt: now(), ref, targets: result.targets }
    return result
  }

  const preparePlan = async (
    kind: DeploymentPreparedKind,
    draft: DeploymentDraft,
    signal?: AbortSignal,
  ): Promise<{ ok: true; plan: DeploymentPreparedPlan } | DeploymentFailure> => {
    const request = Symbol()
    preparing.set(draft.environment, request)
    for (const [preflightId, stored] of prepared) {
      if (stored.public.environment === draft.environment) prepared.delete(preflightId)
    }

    const githubFailure = await requireGithub(signal)
    if (githubFailure) return githubFailure

    const settings = readDeploymentSettings(runtime.store)
    const target = await verifyArgoDevTarget(argo, settings, signal)
    if (!target.ok) return target.failure

    const ref = await validateGithubRef(github, draft.ref, signal)
    if (!ref.ok) return ref

    if (dispatching.has(draft.environment) || blockingOperation(draft.environment)) {
      return deploymentFailure("conflict", {
        capability: "github_workflow_dispatch",
        context: { environment: draft.environment },
      })
    }

    const listed = await loadWorkflowTargets(true, ref.ref, signal)
    if (!listed.ok) return listed
    const selected = draft.workflows.map((selection) => {
      const targetWorkflow = listed.targets.find((workflow) => workflow.target.filename === selection.filename)
      return { selection, targetWorkflow }
    })
    const missing = selected.find((item) => !item.targetWorkflow)
    if (missing) {
      return deploymentFailure("not-found", {
        capability: "github_workflow_dispatch",
        context: { workflow: missing.selection.filename },
      })
    }

    const normalized = selected.map((item) => {
      const workflow = item.targetWorkflow!
      const requiredUnsupported = workflow.issues.filter((issue) => issue.reason === "unsupported")
      const inputs = normalizeDeploymentWorkflowInputs(workflow.target.inputs, item.selection.inputs)
      const bound = Object.fromEntries(
        Object.entries(workflow.boundInputs).map(([name, source]) => [
          name,
          source === "environment" ? draft.environment : ref.ref,
        ]),
      )
      return { workflow, requiredUnsupported, inputs, bound }
    })
    const blocked = normalized.find((item) => item.requiredUnsupported.length > 0 || item.inputs.issues.length > 0)
    if (blocked) {
      return deploymentFailure("invalid-input", {
        capability: "github_workflow_dispatch",
        context: { workflow: blocked.workflow.target.filename },
      })
    }

    if (preparing.get(draft.environment) !== request) {
      return deploymentFailure("cancelled", { capability: "github_workflow_dispatch" })
    }
    const warnings = isReservedDevEnvironment(draft.environment) ? (["unsafe-target"] as const) : []
    const preflightId = createId()
    const expiresAt = now() + DEPLOYMENT_PREPARED_PLAN_TTL_MS
    const plan: DeploymentPreparedPlan = {
      preflightId,
      expiresAt: new Date(expiresAt).toISOString(),
      kind,
      environment: draft.environment,
      ref: ref.ref,
      workflows: normalized.map((item) => ({
        filename: item.workflow.target.filename,
        name: item.workflow.target.name,
        inputs: item.inputs.values,
      })),
      warnings: [...warnings],
    }
    prepared.set(preflightId, {
      public: plan,
      expiresAt,
      bound: normalized.map((item) => ({
        filename: item.workflow.target.filename,
        inputs: { ...item.inputs.values, ...item.bound },
      })),
    })
    return { ok: true, plan }
  }

  const dispatchPlan = async (
    preflightId: string,
    kind: DeploymentPreparedKind,
  ): Promise<{ ok: true; operation: DeploymentOperationSummary } | DeploymentFailure> => {
    const stored = prepared.get(preflightId)
    if (!stored) return deploymentFailure("not-found", { capability: "github_workflow_dispatch" })
    if (stored.public.kind !== kind) {
      return deploymentFailure("invalid-input", { capability: "github_workflow_dispatch", context: { field: "kind" } })
    }
    if (now() >= stored.expiresAt) {
      prepared.delete(preflightId)
      return deploymentFailure("timeout", { capability: "github_workflow_dispatch", context: { field: "preflight" } })
    }

    const githubFailure = await requireGithub()
    if (githubFailure) return githubFailure
    const settings = readDeploymentSettings(runtime.store)
    const target = await verifyArgoDevTarget(argo, settings)
    if (!target.ok) return target.failure
    if (dispatching.has(stored.public.environment) || blockingOperation(stored.public.environment)) {
      return deploymentFailure("conflict", {
        capability: "github_workflow_dispatch",
        context: { environment: stored.public.environment },
      })
    }

    // Readiness checks yield; a concurrent dispatch or settings save may consume this plan.
    if (prepared.get(preflightId) !== stored) {
      return deploymentFailure("not-found", { capability: "github_workflow_dispatch" })
    }
    if (now() >= stored.expiresAt) {
      prepared.delete(preflightId)
      return deploymentFailure("timeout", { capability: "github_workflow_dispatch", context: { field: "preflight" } })
    }
    prepared.delete(preflightId)
    const createdAt = new Date(now()).toISOString()
    const ticketKey = deploymentTicketKey(stored.public.ref)
    const operation: DeploymentOperationSummary = {
      id: createId(),
      environment: stored.public.environment,
      branch: stored.public.ref,
      ...(ticketKey ? { ticketKey } : {}),
      workflows: stored.public.workflows.map((workflow) => ({
        filename: workflow.filename,
        state: "dispatching" as const,
      })),
      state: "dispatching",
      createdAt,
      updatedAt: createdAt,
    }
    dispatching.add(operation.environment)
    await persistOperations((current) => [...current, operation]).finally(() =>
      dispatching.delete(operation.environment),
    )

    const workflowResults = await stored.bound.reduce<Promise<DeploymentWorkflowOperation[]>>(
      async (previous, workflow) => {
        const completed = await previous
        const dispatched = await dispatchGithubWorkflow(github, {
          filename: workflow.filename,
          ref: stored.public.ref,
          inputs: workflow.inputs,
        })
        if (!dispatched.ok) {
          const uncertain = ["timeout", "cancelled", "unknown", "network", "malformed"].includes(dispatched.category)
          return [
            ...completed,
            {
              filename: workflow.filename,
              state: uncertain ? "unknown" : "failure",
            },
          ]
        }
        if (!dispatched.runUrl) {
          return [...completed, { filename: workflow.filename, state: "unknown" }]
        }
        return [
          ...completed,
          {
            filename: workflow.filename,
            state: "queued",
            runId: dispatched.runId,
            runUrl: dispatched.runUrl,
          },
        ]
      },
      Promise.resolve([]),
    )

    const next: DeploymentOperationSummary = {
      ...operation,
      workflows: workflowResults,
      state: aggregateDispatchState(workflowResults.map((workflow) => workflow.state)),
      updatedAt: new Date(now()).toISOString(),
    }
    await persistOperations((current) => current.map((item) => (item.id === operation.id ? next : item)))
    return { ok: true, operation: next }
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
          operations: operations(),
          ...(result.fetchedAt ? { fetchedAt: result.fetchedAt } : {}),
          ...(result.staleFailure ? { staleFailure: result.staleFailure } : {}),
        },
      }
    },
    async checkReadiness() {
      const result = await listSystems({ requestId: "readiness", refresh: true })
      return result.ok ? result.readiness : createDeploymentReadiness({})
    },
    listOperations: () => ({ ok: true as const, operations: operations() }),
    async listBranches(input: { query: string }, signal?: AbortSignal) {
      const githubFailure = await requireGithub(signal)
      if (githubFailure) return githubFailure
      return listGithubBranches(github, input.query, signal)
    },
    async listWorkflowTargets(input: { refresh: boolean }, signal?: AbortSignal) {
      const githubFailure = await requireGithub(signal)
      if (githubFailure) return githubFailure
      const listed = await loadWorkflowTargets(input.refresh, undefined, signal)
      if (!listed.ok) return listed
      return { ok: true as const, targets: listed.targets.map((item) => item.target) }
    },
    prepareDeployment: (draft: DeploymentDraft, signal?: AbortSignal) => preparePlan("deploy", draft, signal),
    dispatchPrepared: (input: { preflightId: string }) => dispatchPlan(input.preflightId, "deploy"),
    async prepareReset(input: { environment: AllowedDevEnvironment }, signal?: AbortSignal) {
      const githubFailure = await requireGithub(signal)
      if (githubFailure) return githubFailure
      const listed = await loadWorkflowTargets(true, RESET_DEPLOYMENT_REF, signal)
      if (!listed.ok) return listed
      const shop = listed.targets.find((item) => item.target.filename === PREFERRED_DEPLOYMENT_WORKFLOW)
      if (!shop) {
        return deploymentFailure("not-found", {
          capability: "github_workflow_dispatch",
          context: { workflow: PREFERRED_DEPLOYMENT_WORKFLOW },
        })
      }
      return preparePlan(
        "reset",
        {
          environment: input.environment,
          ref: RESET_DEPLOYMENT_REF,
          workflows: [
            {
              filename: shop.target.filename,
              inputs: resetDeploymentWorkflowInputs(shop.target.inputs),
            },
          ],
        },
        signal,
      )
    },
    dispatchPreparedReset: (input: { preflightId: string }) => dispatchPlan(input.preflightId, "reset"),
    invalidate,
  }
}

export type DeploymentService = ReturnType<typeof createDeploymentService>

function aggregateDispatchState(states: readonly DeploymentOperationState[]): DeploymentOperationState {
  if (states.some((state) => state === "unknown")) return "unknown"
  if (states.some((state) => state === "queued")) return "queued"
  if (states.every((state) => state === "failure")) return "failure"
  return "unknown"
}

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
