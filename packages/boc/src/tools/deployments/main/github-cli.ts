import { Option, Schema } from "effect"
import { deploymentFailure, type DeploymentCapability, type DeploymentFailure } from "../domain/failures"
import {
  deploymentWorkflowFilenameFromPath,
  isDeploymentWorkflowFilename,
  preferredDeploymentWorkflows,
  type DeploymentWorkflowFilename,
  type DeploymentWorkflowInputValue,
} from "../domain/workflows"
import type { DeploymentCapabilityStatus } from "../rpcs"
import { deploymentCommandFailure } from "./command-failure"
import type { DeploymentCommand, DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"
import { parseWorkflowDispatchContract, type ParsedDeploymentWorkflow } from "./workflow-parser"

export const DEPLOYMENT_GITHUB_OWNER = "bergfreunde"
export const DEPLOYMENT_GITHUB_REPO = "shop"
export const DEPLOYMENT_GITHUB_REPOSITORY = `${DEPLOYMENT_GITHUB_OWNER}/${DEPLOYMENT_GITHUB_REPO}`
export const DEPLOYMENT_GITHUB_HOST = "github.com"
export const DEPLOYMENT_WORKFLOW_CACHE_MS = 5 * 60 * 1000
export const DEPLOYMENT_BRANCH_QUERY_MIN_LENGTH = 2
export const DEPLOYMENT_BRANCH_RESULT_LIMIT = 20
export const DEPLOYMENT_DISPATCH_TIMEOUT_MS = 60_000

const GITHUB_TOKEN_ENV = {
  GH_TOKEN: undefined,
  GITHUB_TOKEN: undefined,
  GH_ENTERPRISE_TOKEN: undefined,
}

const BRANCH_SEARCH_QUERY = `query ($owner: String!, $name: String!, $q: String!, $limit: Int!) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", query: $q, first: $limit) {
      nodes { name }
    }
  }
}`

const decodeWorkflowList = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Array(
      Schema.Struct({
        name: Schema.String,
        path: Schema.String,
        state: Schema.String,
      }),
    ),
  ),
)

const decodeBranchSearch = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      data: Schema.optionalKey(
        Schema.Struct({
          repository: Schema.NullOr(
            Schema.Struct({
              refs: Schema.optionalKey(
                Schema.Struct({
                  nodes: Schema.optionalKey(Schema.Array(Schema.Struct({ name: Schema.String }))),
                }),
              ),
            }),
          ),
        }),
      ),
    }),
  ),
)

export type GithubCliRuntime = {
  run: DeploymentCommandRunner
}

export type GithubStatuses = Partial<Record<DeploymentCapability, Omit<DeploymentCapabilityStatus, "capability">>>

export type GithubReadiness =
  | { ok: true; statuses: GithubStatuses }
  | { ok: false; failure: DeploymentFailure; statuses: GithubStatuses }

export type GithubWorkflowTarget = ParsedDeploymentWorkflow & { active: true }

export function githubRepoArgs() {
  return ["--repo", DEPLOYMENT_GITHUB_REPOSITORY] as const
}

export function githubAuthStatusArgs() {
  return ["auth", "status", "--hostname", DEPLOYMENT_GITHUB_HOST, "--active"] as const
}

export function githubRepositoryAccessArgs() {
  return ["api", `repos/${DEPLOYMENT_GITHUB_REPOSITORY}`] as const
}

export function githubWorkflowListArgs() {
  return ["workflow", "list", ...githubRepoArgs(), "--json", "name,path,state", "--limit", "100"] as const
}

export function githubWorkflowViewArgs(filename: DeploymentWorkflowFilename, ref?: string) {
  return ["workflow", "view", filename, "--yaml", ...githubRepoArgs(), ...(ref ? ["--ref", ref] : [])] as const
}

export function githubWorkflowRunArgs(filename: DeploymentWorkflowFilename, ref: string) {
  return ["workflow", "run", filename, ...githubRepoArgs(), "--ref", ref, "--json"] as const
}

export function githubBranchSearchArgs(query: string) {
  return [
    "api",
    "graphql",
    "-f",
    `query=${BRANCH_SEARCH_QUERY}`,
    "-F",
    `owner=${DEPLOYMENT_GITHUB_OWNER}`,
    "-F",
    `name=${DEPLOYMENT_GITHUB_REPO}`,
    "-F",
    `q=${query}`,
    "-F",
    `limit=${DEPLOYMENT_BRANCH_RESULT_LIMIT}`,
  ] as const
}

export function dispatchWorkflowInputs(values: Readonly<Record<string, DeploymentWorkflowInputValue>>) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      typeof value === "boolean" ? (value ? "true" : "false") : value,
    ]),
  )
}

export function parseGithubWorkflowRun(stdout: string) {
  const match = stdout.match(
    new RegExp(`https://github\\.com/${DEPLOYMENT_GITHUB_OWNER}/${DEPLOYMENT_GITHUB_REPO}/actions/runs/(\\d+)`),
  )
  if (!match?.[1]) return undefined
  return {
    runId: match[1],
    runUrl: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/actions/runs/${match[1]}`,
  }
}

export async function githubReadiness(runtime: GithubCliRuntime, signal?: AbortSignal): Promise<GithubReadiness> {
  const version = await runGh(runtime, ["--version"], { signal })
  if (!version.ok) {
    const failure = deploymentCommandFailure(version, "gh_cli")
    return { ok: false, failure, statuses: { gh_cli: { status: "unavailable", failure: failure.category } } }
  }
  const installedVersion = version.stdout.match(/gh version (\S+)/)?.[1]
  const cli = {
    status: "available" as const,
    ...(installedVersion ? { context: { version: installedVersion } } : {}),
  }

  const auth = await runGh(runtime, githubAuthStatusArgs(), { signal })
  if (!auth.ok) {
    const failure =
      auth.reason === "not-found"
        ? deploymentFailure("missing-cli", { capability: "gh_cli" })
        : deploymentFailure("not-authenticated", { capability: "github_auth" })
    return {
      ok: false,
      failure,
      statuses: {
        gh_cli: cli,
        github_auth: { status: "unavailable", failure: failure.category },
      },
    }
  }

  const repository = await runGh(runtime, githubRepositoryAccessArgs(), { signal })
  if (!repository.ok) {
    const failure = deploymentCommandFailure(repository, "github_repo_access")
    return {
      ok: false,
      failure,
      statuses: {
        gh_cli: cli,
        github_auth: { status: "available" },
        github_repo_access: { status: "unavailable", failure: failure.category },
      },
    }
  }

  const workflows = await runGh(runtime, githubWorkflowListArgs(), { signal })
  if (!workflows.ok) {
    const failure = deploymentCommandFailure(workflows, "github_workflow_dispatch")
    return {
      ok: false,
      failure,
      statuses: {
        gh_cli: cli,
        github_auth: { status: "available" },
        github_repo_access: { status: "available" },
        github_workflow_dispatch: { status: "unavailable", failure: failure.category },
      },
    }
  }
  if (!Option.getOrUndefined(decodeWorkflowList(workflows.stdout))) {
    const failure = deploymentFailure("malformed", { capability: "github_workflow_dispatch" })
    return {
      ok: false,
      failure,
      statuses: {
        gh_cli: cli,
        github_auth: { status: "available" },
        github_repo_access: { status: "available" },
        github_workflow_dispatch: { status: "unavailable", failure: "malformed" },
      },
    }
  }

  return {
    ok: true,
    statuses: {
      gh_cli: cli,
      github_auth: { status: "available" },
      github_repo_access: { status: "available" },
      github_workflow_dispatch: { status: "available" },
    },
  }
}

export async function listGithubBranches(
  runtime: GithubCliRuntime,
  query: string,
  signal?: AbortSignal,
): Promise<{ ok: true; branches: string[] } | DeploymentFailure> {
  const trimmed = query.trim()
  if (trimmed.length < DEPLOYMENT_BRANCH_QUERY_MIN_LENGTH) return { ok: true, branches: [] }
  return searchGithubBranches(runtime, trimmed, signal)
}

async function searchGithubBranches(
  runtime: GithubCliRuntime,
  query: string,
  signal?: AbortSignal,
): Promise<{ ok: true; branches: string[] } | DeploymentFailure> {
  if (query.length > 255 || query.includes("..") || /[\u0000-\u001f=]/.test(query)) {
    return deploymentFailure("invalid-input", { capability: "github_repo_access", context: { field: "ref" } })
  }

  const result = await runGh(runtime, githubBranchSearchArgs(query), { signal })
  if (!result.ok) return deploymentCommandFailure(result, "github_repo_access")
  const parsed = Option.getOrUndefined(decodeBranchSearch(result.stdout))
  if (!parsed) return deploymentFailure("malformed", { capability: "github_repo_access" })
  if (!parsed.data?.repository) return deploymentFailure("not-found", { capability: "github_repo_access" })

  const names = parsed.data.repository.refs?.nodes?.map((node) => node.name) ?? []
  return {
    ok: true,
    branches: names.filter((name) => name.length > 0 && !name.includes("..")).slice(0, DEPLOYMENT_BRANCH_RESULT_LIMIT),
  }
}

export async function validateGithubRef(
  runtime: GithubCliRuntime,
  ref: string,
  signal?: AbortSignal,
): Promise<{ ok: true; ref: string } | DeploymentFailure> {
  const trimmed = ref.trim()
  if (!trimmed || trimmed.length > 255 || trimmed.includes("..") || trimmed.startsWith("/")) {
    return deploymentFailure("invalid-input", { capability: "github_repo_access", context: { field: "ref" } })
  }
  const listed = await searchGithubBranches(runtime, trimmed, signal)
  if (!listed.ok) return listed
  if (!listed.branches.includes(trimmed)) {
    return deploymentFailure("not-found", { capability: "github_repo_access", context: { field: "ref" } })
  }
  return { ok: true, ref: trimmed }
}

export async function listGithubWorkflowTargets(
  runtime: GithubCliRuntime,
  ref?: string,
  signal?: AbortSignal,
): Promise<{ ok: true; targets: GithubWorkflowTarget[] } | DeploymentFailure> {
  const listed = await runGh(runtime, githubWorkflowListArgs(), { signal })
  if (!listed.ok) return deploymentCommandFailure(listed, "github_workflow_dispatch")
  const workflows = Option.getOrUndefined(decodeWorkflowList(listed.stdout))
  if (!workflows) return deploymentFailure("malformed", { capability: "github_workflow_dispatch" })

  const active = workflows.flatMap((workflow) => {
    if (workflow.state !== "active") return []
    const filename = deploymentWorkflowFilenameFromPath(workflow.path)
    if (!filename) return []
    return [{ filename, name: workflow.name }]
  })

  const parsed = await Promise.all(
    preferredDeploymentWorkflows(active).map(async (workflow) => {
      const source = await runGh(runtime, githubWorkflowViewArgs(workflow.filename, ref), { signal })
      if (!source.ok) return undefined
      return parseWorkflowDispatchContract({
        filename: workflow.filename,
        name: workflow.name,
        source: source.stdout,
      })
    }),
  )

  return {
    ok: true,
    targets: parsed
      .filter((target): target is ParsedDeploymentWorkflow => target !== undefined)
      .map((target) => ({
        ...target,
        active: true as const,
      })),
  }
}

export async function dispatchGithubWorkflow(
  runtime: GithubCliRuntime,
  input: {
    filename: DeploymentWorkflowFilename
    ref: string
    inputs: Readonly<Record<string, DeploymentWorkflowInputValue>>
  },
): Promise<{ ok: true; runId?: string; runUrl?: string } | DeploymentFailure> {
  if (!isDeploymentWorkflowFilename(input.filename)) {
    return deploymentFailure("invalid-input", {
      capability: "github_workflow_dispatch",
      context: { field: "workflow" },
    })
  }
  const result = await runGh(runtime, githubWorkflowRunArgs(input.filename, input.ref), {
    stdin: JSON.stringify(dispatchWorkflowInputs(input.inputs)),
    timeoutMs: DEPLOYMENT_DISPATCH_TIMEOUT_MS,
  })
  if (!result.ok) {
    if (result.reason === "timeout") return deploymentFailure("unknown", { capability: "github_workflow_dispatch" })
    return deploymentCommandFailure(result, "github_workflow_dispatch")
  }
  const identity = parseGithubWorkflowRun(result.stdout)
  if (!identity) return { ok: true }
  return { ok: true, ...identity }
}

function runGh(
  runtime: GithubCliRuntime,
  args: readonly string[],
  options: { signal?: AbortSignal; stdin?: string; timeoutMs?: number } = {},
): Promise<DeploymentCommandResult> {
  const command: DeploymentCommand = {
    executable: "gh",
    args,
    env: GITHUB_TOKEN_ENV,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  }
  return runtime.run(command)
}
