import type { DeploymentDialogApi } from "../renderer/deploy-preflight"
import type { DeploymentPreparedPlan } from "../rpcs"
import { normalizeDeploymentWorkflowInputs, resetDeploymentWorkflowInputs } from "../domain/workflows"
import type { DeploymentWorkflowTarget } from "../domain/workflows"
import { deploymentBranchFixtures, deploymentWorkflowFixtures } from "./github"

export function createFixtureDeploymentApi(
  targets: readonly DeploymentWorkflowTarget[] = deploymentWorkflowFixtures,
): DeploymentDialogApi {
  const plans = new Map<string, DeploymentPreparedPlan>()
  const prepare = (plan: Omit<DeploymentPreparedPlan, "preflightId" | "expiresAt">) => {
    const prepared = {
      ...plan,
      preflightId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }
    plans.set(prepared.preflightId, prepared)
    return { ok: true as const, plan: prepared }
  }
  const dispatch: DeploymentDialogApi["dispatchPrepared"] = async ({ preflightId }) => {
    const plan = plans.get(preflightId)
    if (!plan) return { ok: false, category: "not-found", retryable: false }
    plans.delete(preflightId)
    return {
      ok: true,
      operation: {
        id: crypto.randomUUID(),
        environment: plan.environment,
        branch: plan.ref,
        workflows: plan.workflows.map((workflow) => ({ filename: workflow.filename, state: "queued" as const })),
        state: "queued",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }
  }
  return {
    cancelSystemsRead: async () => {},
    listBranches: async ({ query }) => ({
      ok: true,
      branches: deploymentBranchFixtures.filter((branch) => branch.toLowerCase().includes(query.trim().toLowerCase())),
    }),
    listWorkflowTargets: async () => ({ ok: true, targets }),
    prepareDeployment: async (draft) =>
      prepare({
        kind: draft.expectedBranch === undefined ? "deploy" : "redeploy",
        environment: draft.environment,
        ref: draft.ref,
        workflows: draft.workflows.map((workflow) => {
          const target = targets.find((target) => target.filename === workflow.filename)
          return {
            filename: workflow.filename,
            name: target?.name ?? workflow.filename,
            inputs: normalizeDeploymentWorkflowInputs(target?.inputs ?? [], workflow.inputs).values,
          }
        }),
        warnings: [],
      }),
    prepareReset: async ({ environment }) =>
      prepare({
        kind: "reset",
        environment,
        ref: "master",
        workflows: [
          {
            filename: deploymentWorkflowFixtures[0].filename,
            name: deploymentWorkflowFixtures[0].name,
            inputs: resetDeploymentWorkflowInputs(deploymentWorkflowFixtures[0].inputs),
          },
        ],
        warnings: [],
      }),
    dispatchPrepared: dispatch,
    dispatchPreparedReset: dispatch,
  }
}
