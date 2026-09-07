import { Option, Schema } from "effect"
import {
  aggregateDeploymentOperation,
  isTerminalDeploymentOperation,
  type DeploymentOperationState,
  type DeploymentOperationSummary,
  type DeploymentWorkflowOperation,
} from "../domain/operations"
import { DEPLOYMENT_GITHUB_REPOSITORY, runGh, type GithubCliRuntime } from "./github-cli"

const decodeRun = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      databaseId: Schema.Number,
      status: Schema.String,
      conclusion: Schema.NullOr(Schema.String),
      jobs: Schema.Array(
        Schema.Struct({
          databaseId: Schema.Number,
          name: Schema.String,
          status: Schema.String,
          conclusion: Schema.NullOr(Schema.String),
        }),
      ),
    }),
  ),
)

const decodeRuns = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        databaseId: Schema.Number,
        createdAt: Schema.String,
      }),
    ),
  ),
)

export async function readDeploymentOperation(
  runtime: GithubCliRuntime,
  operation: DeploymentOperationSummary,
): Promise<DeploymentOperationSummary> {
  const workflows = await Promise.all(
    operation.workflows.map(async (workflow) => {
      if (isTerminalDeploymentOperation(workflow.state)) return workflow
      const runId = workflow.runId ?? (await findDeploymentRun(runtime, operation, workflow))
      if (!runId) return { ...workflow, trackingUnavailable: true }
      const result = await runGh(runtime, [
        "run",
        "view",
        runId,
        "--repo",
        DEPLOYMENT_GITHUB_REPOSITORY,
        "--json",
        "databaseId,status,conclusion,jobs",
      ])
      const run = result.ok ? Option.getOrUndefined(decodeRun(result.stdout)) : undefined
      if (!run || String(run.databaseId) !== runId) return { ...workflow, trackingUnavailable: true }
      const jobs = run.jobs.map((job) => ({
        id: job.databaseId,
        name: job.name,
        state:
          job.conclusion === "skipped"
            ? ("skipped" as const)
            : job.status === "waiting" || job.status === "pending"
              ? ("waiting" as const)
              : githubRunState(job.status, job.conclusion),
      }))
      const deploymentJobs = workflow.filename === "app-shop.yml" ? shopDeploymentJobs(operation.environment, jobs) : []
      const deployed = deploymentJobs.length === 2 && deploymentJobs.every((job) => job.state === "success")
      const state = deployed ? "success" : githubRunState(run.status, run.conclusion)
      return {
        ...workflow,
        runId,
        runUrl: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/actions/runs/${runId}`,
        jobs,
        state,
        trackingUnavailable: false,
        ...(isTerminalDeploymentOperation(state)
          ? { completion: deployed ? ("deployment" as const) : ("workflow" as const) }
          : {}),
      }
    }),
  )
  return {
    ...operation,
    dispatchedAt: operation.dispatchedAt ?? operation.updatedAt,
    workflows,
    state: aggregateDeploymentOperation(workflows.map((workflow) => workflow.state)),
  }
}

export function githubRunState(status: string, conclusion: string | null): DeploymentOperationState {
  if (status !== "completed") {
    return ["in_progress", "waiting", "pending"].includes(status) ? "in-progress" : "queued"
  }
  if (conclusion === "success") return "success"
  if (conclusion === "cancelled" || conclusion === "skipped") return "cancelled"
  if (conclusion === "timed_out") return "timed-out"
  if (["failure", "action_required", "startup_failure", "stale"].includes(conclusion ?? "")) return "failure"
  return "unknown"
}

function shopDeploymentJobs<T extends { name: string }>(environment: string, jobs: readonly T[]) {
  return [`Deploy ${environment} to adminserver`, `Deploy ${environment} to k8s`].flatMap((name) => {
    const matches = jobs.filter((job) => job.name === name || job.name.endsWith(` / ${name}`))
    return matches.length === 1 ? matches : []
  })
}

async function findDeploymentRun(
  runtime: GithubCliRuntime,
  operation: DeploymentOperationSummary,
  workflow: DeploymentWorkflowOperation,
) {
  // Older gh versions accept dispatches without returning a run URL. Only recover
  // an identity when the dispatch window AND environment-specific jobs identify it.
  if (workflow.filename !== "app-shop.yml") return undefined
  const result = await runGh(runtime, [
    "run",
    "list",
    "--repo",
    DEPLOYMENT_GITHUB_REPOSITORY,
    "--workflow",
    workflow.filename,
    "--branch",
    operation.branch,
    "--event",
    "workflow_dispatch",
    "--limit",
    "30",
    "--json",
    "databaseId,createdAt",
  ])
  const runs = result.ok ? Option.getOrUndefined(decodeRuns(result.stdout)) : undefined
  const candidates =
    runs?.filter((run) => {
      const created = Date.parse(run.createdAt)
      return (
        created >= Date.parse(operation.createdAt) - 5_000 &&
        created <= Date.parse(operation.dispatchedAt ?? operation.updatedAt) + 5_000
      )
    }) ?? []
  const matches = await Promise.all(
    candidates.map(async (candidate) => {
      const result = await runGh(runtime, [
        "run",
        "view",
        String(candidate.databaseId),
        "--repo",
        DEPLOYMENT_GITHUB_REPOSITORY,
        "--json",
        "databaseId,status,conclusion,jobs",
      ])
      const run = result.ok ? Option.getOrUndefined(decodeRun(result.stdout)) : undefined
      return run && shopDeploymentJobs(operation.environment, run.jobs).length === 2
        ? String(run.databaseId)
        : undefined
    }),
  )
  const identified = matches.filter((id) => id !== undefined)
  return identified.length === 1 ? identified[0] : undefined
}
