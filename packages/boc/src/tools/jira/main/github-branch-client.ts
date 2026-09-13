import { Option, Schema } from "effect"
import { runGh } from "../../deployments/main/github-cli"
import { DEPLOYMENT_GITHUB_REPOSITORY } from "../../deployments/domain/github"
import type { DeploymentCommandRunner } from "../../deployments/main/command-runner"
import { JiraIssueKey } from "../domain/issue"
import { matchesJiraBranch } from "../domain/pull-request"
import type { JiraBranchesResult } from "../rpcs"

const Branches = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.Struct({
      refs: Schema.Struct({
        nodes: Schema.Array(Schema.Struct({ name: Schema.String })),
        pageInfo: Schema.Struct({ hasNextPage: Schema.Boolean }),
      }),
    }),
  }),
})

export async function fetchJiraBranches(
  run: DeploymentCommandRunner,
  issueKey: string,
  signal?: AbortSignal,
): Promise<JiraBranchesResult> {
  if (!Schema.is(JiraIssueKey)(issueKey)) return { ok: false, category: "malformed" }
  const [owner, name] = DEPLOYMENT_GITHUB_REPOSITORY.split("/")
  const result = await runGh(
    { run },
    [
      "api",
      "graphql",
      "-f",
      'query=query($owner:String!,$name:String!,$key:String!){repository(owner:$owner,name:$name){refs(refPrefix:"refs/heads/",query:$key,first:100){nodes{name} pageInfo{hasNextPage}}}}',
      "-f",
      `owner=${owner}`,
      "-f",
      `name=${name}`,
      "-f",
      `key=${issueKey}`,
    ],
    { signal, timeoutMs: 30_000 },
  ).catch(() => undefined)
  if (!result) return { ok: false, category: "network" }
  if (!result.ok)
    return {
      ok: false,
      category: /gh auth login|GH_TOKEN/.test(result.stderr)
        ? "not-authenticated"
        : result.reason === "not-found"
          ? "missing-cli"
          : "network",
    }
  const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(Branches))(result.stdout))
  if (!parsed) return { ok: false, category: "malformed" }
  return {
    ok: true,
    branches: parsed.data.repository.refs.nodes
      .filter((branch) => matchesJiraBranch(branch.name, issueKey))
      .map((branch) => ({
        name: branch.name,
        url: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/tree/${encodeURIComponent(branch.name)}`,
      })),
    truncated: parsed.data.repository.refs.pageInfo.hasNextPage,
  }
}
