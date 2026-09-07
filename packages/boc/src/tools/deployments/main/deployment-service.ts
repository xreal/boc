import path from "node:path"
import { DEPLOYMENT_KUBE_CONTEXT, isReservedDevEnvironment, type AllowedDevEnvironment } from "../domain/environments"
import { deploymentFailure, type DeploymentFailure } from "../domain/failures"
import {
  isBlockingDeploymentOperation,
  isTerminalDeploymentOperation,
  aggregateDeploymentOperation,
  pruneDeploymentHistory,
  type DeploymentOperationSummary,
  type DeploymentWorkflowOperation,
} from "../domain/operations"
import { deploymentTicketKey, type DeploymentRowAction, type DeploymentSystem } from "../domain/systems"
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
import { deploymentCommandFailure } from "./command-failure"
import { readDeploymentOperation } from "./operation-tracker"
import type { CacheRunSnapshot } from "./cache-runner"
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
  runCache?: (environment: AllowedDevEnvironment, onUpdate: (snapshot: CacheRunSnapshot) => void) => void
  notifyFinished?: (operation: DeploymentOperationSummary) => void
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
  expectedBranch?: string
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
  const changingAutoSync = new Set<AllowedDevEnvironment>()
  const cacheRuns = new Map<AllowedDevEnvironment, CacheRunSnapshot>()
  let writes = Promise.resolve()
  let tracking: Promise<void> | undefined
  let trackingTimer: ReturnType<typeof setTimeout> | undefined
  let trackingEnabled = false

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

  const refreshOperations = () => {
    if (tracking) return tracking
    tracking = (async () => {
      const active = operations().filter(
        (operation) => isBlockingDeploymentOperation(operation.state) && !dispatching.has(operation.environment),
      )
      for (const operation of active) {
        const next = await readDeploymentOperation(github, operation)
        if (JSON.stringify(next) === JSON.stringify(operation)) continue
        const finished = isTerminalDeploymentOperation(next.state)
        const updatedAt = new Date(now()).toISOString()
        const updated = { ...next, updatedAt, ...(finished ? { finishedAt: updatedAt } : {}) }
        await persistOperations((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        if (finished) {
          cache = undefined
          if (readDeploymentSettings(runtime.store).notificationsEnabled) runtime.notifyFinished?.(updated)
        }
      }
    })().finally(() => {
      tracking = undefined
    })
    return tracking
  }

  const track = async () => {
    await refreshOperations().catch(() => undefined)
    if (trackingEnabled) {
      trackingTimer = setTimeout(() => void track(), 10_000)
      trackingTimer.unref?.()
    }
  }

  const attachSystems = (systems: readonly DeploymentSystem[], readiness: DeploymentReadiness) => {
    const history = operations()
    return systems.map((system) => {
      const matching = history.filter((item) => item.environment === system.environment)
      const operation = matching.find((item) => isBlockingDeploymentOperation(item.state))
      const latest = matching.at(-1)
      const displayed = operation ?? latest
      const redeploy =
        system.branch &&
        system.branch.trim().toLowerCase() !== "master" &&
        !isReservedDevEnvironment(system.environment)
          ? (["redeploy"] as const)
          : []
      const autoSync =
        system.autoSync !== "off" &&
        !isReservedDevEnvironment(system.environment) &&
        readiness.capabilities.find((item) => item.capability === "bf_deploy_auto_sync")?.status === "available"
          ? (["auto-sync"] as const)
          : []
      const cacheBlocked = cacheRunBlocks(system.environment)
      const allowed: readonly DeploymentRowAction[] =
        !operation && !changingAutoSync.has(system.environment) && !cacheBlocked
          ? [
              ...(readiness.deploymentReady ? (["deploy", "reset", ...redeploy] as const) : []),
              ...autoSync,
              ...(!isReservedDevEnvironment(system.environment) && runtime.runCache ? (["clear-cache"] as const) : []),
            ]
          : []
      return {
        ...system,
        ...(displayed ? { operation: displayed } : {}),
        allowedActions: [...allowed],
      }
    })
  }

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
    if (conflictingMutation(draft.environment)) {
      return deploymentFailure("conflict", {
        capability: "github_workflow_dispatch",
        context: { environment: draft.environment },
      })
    }
    const request = Symbol()
    preparing.set(draft.environment, request)
    for (const [preflightId, stored] of prepared) {
      if (stored.public.environment === draft.environment) prepared.delete(preflightId)
    }

    const githubFailure = await requireGithub(signal)
    if (githubFailure) return githubFailure

    const settings = readDeploymentSettings(runtime.store)
    if (kind === "redeploy") {
      if (draft.ref !== draft.expectedBranch) {
        return deploymentFailure("invalid-input", {
          capability: "github_workflow_dispatch",
          context: { field: "ref" },
        })
      }
      const current = await verifyRedeployTarget(settings, draft.environment, draft.expectedBranch, signal)
      if (!current.ok) return current
    } else {
      const target = await verifyArgoDevTarget(argo, settings, signal)
      if (!target.ok) return target.failure
    }

    const ref = await validateGithubRef(github, draft.ref, signal)
    if (!ref.ok) return ref

    if (conflictingMutation(draft.environment)) {
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
      ...(kind === "redeploy" ? { expectedBranch: draft.expectedBranch } : {}),
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
    if (kind === "redeploy") {
      if (stored.public.ref !== stored.expectedBranch) {
        return deploymentFailure("invalid-input", {
          capability: "github_workflow_dispatch",
          context: { field: "ref" },
        })
      }
      const current = await verifyRedeployTarget(settings, stored.public.environment, stored.expectedBranch)
      if (!current.ok) return current
    } else {
      const target = await verifyArgoDevTarget(argo, settings)
      if (!target.ok) return target.failure
    }
    if (conflictingMutation(stored.public.environment)) {
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
    try {
      await persistOperations((current) => [...current, operation])
      const workflowResults: DeploymentWorkflowOperation[] = []
      for (const workflow of stored.bound) {
        const dispatched = await dispatchGithubWorkflow(github, {
          filename: workflow.filename,
          ref: stored.public.ref,
          inputs: workflow.inputs,
        })
        workflowResults.push(
          dispatched.ok
            ? {
                filename: workflow.filename,
                state: dispatched.runUrl ? "queued" : "unknown",
                ...(dispatched.runUrl ? { runId: dispatched.runId, runUrl: dispatched.runUrl } : {}),
              }
            : {
                filename: workflow.filename,
                state: ["timeout", "cancelled", "unknown", "network", "malformed"].includes(dispatched.category)
                  ? "unknown"
                  : "failure",
              },
        )
        // Keep accepted run identities across a desktop restart, including partial dispatches.
        await persistOperations((current) =>
          current.map((item) =>
            item.id === operation.id
              ? {
                  ...item,
                  workflows: [...workflowResults, ...operation.workflows.slice(workflowResults.length)],
                  dispatchedAt: new Date(now()).toISOString(),
                }
              : item,
          ),
        )
      }

      const updatedAt = new Date(now()).toISOString()
      const state = aggregateDeploymentOperation(workflowResults.map((workflow) => workflow.state))
      const next: DeploymentOperationSummary = {
        ...operation,
        workflows: workflowResults,
        state,
        updatedAt,
        dispatchedAt: updatedAt,
        ...(isTerminalDeploymentOperation(state) ? { finishedAt: updatedAt } : {}),
      }
      await persistOperations((current) => current.map((item) => (item.id === operation.id ? next : item)))
      if (isTerminalDeploymentOperation(next.state) && readDeploymentSettings(runtime.store).notificationsEnabled) {
        runtime.notifyFinished?.(next)
      }
      return { ok: true, operation: next }
    } finally {
      dispatching.delete(operation.environment)
    }
  }

  return {
    refreshOperations,
    startTracking() {
      if (trackingEnabled) return
      trackingEnabled = true
      void track()
    },
    stopTracking() {
      trackingEnabled = false
      clearTimeout(trackingTimer)
    },
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
    prepareDeployment: (draft: DeploymentDraft, signal?: AbortSignal) =>
      preparePlan(draft.expectedBranch === undefined ? "deploy" : "redeploy", draft, signal),
    dispatchPrepared: (input: { preflightId: string }) => {
      const kind = prepared.get(input.preflightId)?.public.kind
      return dispatchPlan(input.preflightId, kind === "redeploy" ? "redeploy" : "deploy")
    },
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
    async turnAutoSyncOff(input: { environment: AllowedDevEnvironment; expected: "on" | "no-prune" | "off" }) {
      if (isReservedDevEnvironment(input.environment)) {
        return deploymentFailure("unsafe-target", {
          capability: "bf_deploy_auto_sync",
          context: { environment: input.environment },
        })
      }
      if (input.expected === "off") {
        return deploymentFailure("invalid-input", {
          capability: "bf_deploy_auto_sync",
          context: { environment: input.environment, reason: "already-off" },
        })
      }
      if (conflictingMutation(input.environment)) {
        return deploymentFailure("conflict", {
          capability: "bf_deploy_auto_sync",
          context: { environment: input.environment },
        })
      }

      changingAutoSync.add(input.environment)
      try {
        const settings = readDeploymentSettings(runtime.store)
        const capability = await autoSyncCapability(settings, runtime.fileExists)
        if (capability.status !== "available" || !settings.devenvPath) {
          return deploymentFailure(capability.failure ?? "not-found", {
            capability: "bf_deploy_auto_sync",
            context: capability.context,
          })
        }
        const target = await verifyArgoDevTarget(argo, settings)
        if (!target.ok) return target.failure
        const fleet = await readArgoFleet(argo, settings)
        if (!fleet.ok) return fleet.failure
        const system = fleet.systems.find((item) => item.environment === input.environment)
        if (!system) {
          return deploymentFailure("not-found", {
            capability: "bf_deploy_auto_sync",
            context: { environment: input.environment },
          })
        }
        if (system.autoSync !== input.expected) {
          return deploymentFailure("conflict", {
            capability: "bf_deploy_auto_sync",
            context: { environment: input.environment, reason: "state-changed" },
          })
        }
        if (
          dispatching.has(input.environment) ||
          blockingOperation(input.environment) ||
          cacheRuns.get(input.environment)?.state === "running"
        ) {
          return deploymentFailure("conflict", {
            capability: "bf_deploy_auto_sync",
            context: { environment: input.environment },
          })
        }

        // bf-deploy inherits kubectl's current context and does not receive our fixed Argo flags.
        // Refuse the mutation unless that inherited context is exactly the approved development context.
        const currentContext = await runtime.run({ executable: "kubectl", args: ["config", "current-context"] })
        if (!currentContext.ok) return deploymentCommandFailure(currentContext, "dev_target_verified")
        if (currentContext.stdout.trim() !== DEPLOYMENT_KUBE_CONTEXT) {
          return deploymentFailure("unsafe-target", {
            capability: "dev_target_verified",
            context: { expectedContext: DEPLOYMENT_KUBE_CONTEXT, reason: "bf-deploy-current-context" },
          })
        }

        const result = await runtime.run({
          executable: "python3",
          args: [
            path.join(settings.devenvPath, "src", "tools", "bf-deploy", "__main__.py"),
            "argo",
            "--auto-sync",
            "off",
            "-e",
            input.environment,
            "--deployment",
            "shop",
          ],
          cwd: path.join(settings.devenvPath, "src"),
        })
        if (!result.ok) return deploymentCommandFailure(result, "bf_deploy_auto_sync")
        changingAutoSync.delete(input.environment)
        invalidate()
        const refreshed = await listSystems({ requestId: `auto-sync-${input.environment}`, refresh: true })
        if (!refreshed.ok) return refreshed
        if (refreshed.staleFailure) return refreshed.staleFailure
        const updated = refreshed.systems.find((item) => item.environment === input.environment)
        if (updated?.autoSync !== "off") {
          return deploymentFailure("unknown", {
            capability: "bf_deploy_auto_sync",
            context: { environment: input.environment, reason: "state-unconfirmed" },
          })
        }
        return refreshed
      } finally {
        changingAutoSync.delete(input.environment)
      }
    },
    getCacheRun(input: { environment: AllowedDevEnvironment }) {
      if (isReservedDevEnvironment(input.environment)) {
        return deploymentFailure("unsafe-target", { capability: "ssh", context: { environment: input.environment } })
      }
      const run = cacheRuns.get(input.environment)
      return run ? { ok: true as const, run } : { ok: true as const }
    },
    startCacheRun(input: { environment: AllowedDevEnvironment }) {
      if (isReservedDevEnvironment(input.environment) || !runtime.runCache) {
        return deploymentFailure(isReservedDevEnvironment(input.environment) ? "unsafe-target" : "not-found", {
          capability: "ssh",
          context: { environment: input.environment },
        })
      }
      const existing = cacheRuns.get(input.environment)
      if (existing?.state === "running") return { ok: true as const, run: existing }
      if (conflictingMutation(input.environment)) {
        return deploymentFailure("conflict", { capability: "ssh", context: { environment: input.environment } })
      }
      runtime.runCache(input.environment, (snapshot) => cacheRuns.set(input.environment, snapshot))
      const run = cacheRuns.get(input.environment)
      return run ? { ok: true as const, run } : { ok: true as const }
    },
    resolveCacheRun(input: { environment: AllowedDevEnvironment; startedAt: string; confirmedEnded: true }) {
      const existing = cacheRuns.get(input.environment)
      if (!existing || existing.state !== "unknown" || existing.startedAt !== input.startedAt) {
        return deploymentFailure("conflict", {
          capability: "ssh",
          context: { environment: input.environment, reason: "cache-run-changed" },
        })
      }
      const resolved = { ...existing, state: "resolved" as const, finishedAt: new Date(now()).toISOString() }
      cacheRuns.set(input.environment, resolved)
      return { ok: true as const, run: resolved }
    },
    invalidate,
  }

  function conflictingMutation(environment: AllowedDevEnvironment) {
    return (
      dispatching.has(environment) ||
      changingAutoSync.has(environment) ||
      blockingOperation(environment) !== undefined ||
      cacheRunBlocks(environment)
    )
  }

  function cacheRunBlocks(environment: AllowedDevEnvironment) {
    const state = cacheRuns.get(environment)?.state
    return state === "running" || state === "unknown"
  }

  async function verifyRedeployTarget(
    settings: DeploymentSettings,
    environment: AllowedDevEnvironment,
    expectedBranch?: string,
    signal?: AbortSignal,
  ): Promise<{ ok: true } | DeploymentFailure> {
    if (!expectedBranch || expectedBranch.trim().toLowerCase() === "master" || isReservedDevEnvironment(environment)) {
      return deploymentFailure("unsafe-target", {
        capability: "dev_target_verified",
        context: { environment, reason: "redeploy-target" },
      })
    }
    const fleet = await readArgoFleet(argo, settings, signal)
    if (!fleet.ok) return fleet.failure
    const current = fleet.systems.find((system) => system.environment === environment)
    if (!current?.branch || current.branch !== expectedBranch) {
      return deploymentFailure("conflict", {
        capability: "github_workflow_dispatch",
        context: { environment, reason: "branch-changed" },
      })
    }
    return { ok: true }
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
