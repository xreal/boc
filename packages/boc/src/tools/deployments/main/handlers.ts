import { Effect } from "effect"
import { deploymentFailure, type DeploymentCapability } from "../domain/failures"
import { DeploymentRpcs } from "../rpcs"
import type { DeploymentService } from "./deployment-service"
import { createDeploymentReadCoordinator } from "./read-coordinator"

export type DeploymentHandlersRuntime = {
  service: DeploymentService
}

export function createDeploymentHandlers(runtime: DeploymentHandlersRuntime) {
  const reads = createDeploymentReadCoordinator()
  return DeploymentRpcs.toLayer(
    DeploymentRpcs.of({
      BocDeploymentsGetWorkspace: () => Effect.promise(() => runtime.service.getWorkspace()),
      BocDeploymentsListSystems: (payload) =>
        Effect.promise(() => reads.run(payload.requestId, (signal) => runtime.service.listSystems(payload, signal))),
      BocDeploymentsCancelSystemsRead: (payload) => Effect.sync(() => reads.cancel(payload.requestId)),
      BocDeploymentsGetSettings: () => Effect.sync(() => runtime.service.getSettings()),
      BocDeploymentsSaveSettings: (payload) => Effect.promise(() => runtime.service.saveSettings(payload)),
      BocDeploymentsCheckReadiness: () => Effect.promise(() => runtime.service.checkReadiness()),
      BocDeploymentsListBranches: (payload) =>
        Effect.promise(() => reads.run(payload.requestId, (signal) => runtime.service.listBranches(payload, signal))),
      BocDeploymentsListWorkflowTargets: (payload) =>
        Effect.promise(() =>
          reads.run(payload.requestId, (signal) => runtime.service.listWorkflowTargets(payload, signal)),
        ),
      BocDeploymentsListOperations: () => Effect.sync(() => runtime.service.listOperations()),
      BocDeploymentsPrepareDeployment: (payload) =>
        Effect.promise(() =>
          payload.requestId
            ? reads.run(payload.requestId, (signal) => runtime.service.prepareDeployment(payload, signal))
            : runtime.service.prepareDeployment(payload),
        ),
      BocDeploymentsDispatchPrepared: (payload) => Effect.promise(() => runtime.service.dispatchPrepared(payload)),
      BocDeploymentsPrepareReset: (payload) =>
        Effect.promise(() =>
          payload.requestId
            ? reads.run(payload.requestId, (signal) => runtime.service.prepareReset(payload, signal))
            : runtime.service.prepareReset(payload),
        ),
      BocDeploymentsDispatchPreparedReset: (payload) =>
        Effect.promise(() => runtime.service.dispatchPreparedReset(payload)),
      BocDeploymentsRedeployBranch: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsSetAutoSync: (payload) => Effect.promise(() => runtime.service.turnAutoSyncOff(payload)),
      BocDeploymentsGetCacheRun: (payload) => Effect.sync(() => runtime.service.getCacheRun(payload)),
      BocDeploymentsStartCacheRun: (payload) => Effect.sync(() => runtime.service.startCacheRun(payload)),
      BocDeploymentsResolveCacheRun: (payload) => Effect.sync(() => runtime.service.resolveCacheRun(payload)),
    }),
  )
}

function unavailable(capability: DeploymentCapability) {
  return deploymentFailure("not-found", { capability })
}
