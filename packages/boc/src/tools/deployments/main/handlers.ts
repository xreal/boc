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
      BocDeploymentsListBranches: () => Effect.succeed(unavailable("github_repo_access")),
      BocDeploymentsListWorkflowTargets: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsListOperations: () => Effect.succeed({ ok: true as const, operations: [] }),
      BocDeploymentsPrepareDeployment: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsDispatchPrepared: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsPrepareReset: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsDispatchPreparedReset: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsRedeployBranch: () => Effect.succeed(unavailable("github_workflow_dispatch")),
      BocDeploymentsSetAutoSync: () => Effect.succeed(unavailable("bf_deploy_auto_sync")),
    }),
  )
}

function unavailable(capability: DeploymentCapability) {
  return deploymentFailure("not-found", { capability })
}
