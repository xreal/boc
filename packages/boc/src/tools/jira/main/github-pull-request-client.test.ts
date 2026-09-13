import { expect, test } from "bun:test"
import { createGithubPullRequestClient } from "./github-pull-request-client"
import { jiraPullRequestFixtures } from "../fixtures/issue"
import { DEPLOYMENT_GITHUB_REPOSITORY } from "../../deployments/domain/github"
import type { DeploymentCommand, DeploymentCommandResult } from "../../deployments/main/command-runner"

const input = { issueKey: "SHOP-617", refresh: false }
const requests = jiraPullRequestFixtures.map((request) => ({
  ...request,
  url: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/pull/${request.number}`,
}))
const success = { ok: true, exitCode: 0, stdout: JSON.stringify(requests), stderr: "" } as const

test("uses bounded gh args, stored CLI auth, cache and explicit refresh", async () => {
  const commands: DeploymentCommand[] = []
  let now = 0
  const lookup = createGithubPullRequestClient(
    async (command) => {
      commands.push(command)
      return success
    },
    () => now,
  )
  expect((await lookup(input)).ok).toBe(true)
  await lookup(input)
  expect(commands).toHaveLength(1)
  expect(commands[0]?.args).toEqual([
    "pr",
    "list",
    "--repo",
    DEPLOYMENT_GITHUB_REPOSITORY,
    "--state",
    "all",
    "--search",
    "head:SHOP-617",
    "--limit",
    "20",
    "--json",
    "number,title,url,state,isDraft,headRefName,author,updatedAt,reviewDecision",
  ])
  expect(commands[0]?.executable).toBe("gh")
  expect(commands[0]?.timeoutMs).toBe(30_000)
  expect(commands[0]?.env?.GH_TOKEN).toBeUndefined()
  await lookup({ ...input, refresh: true })
  expect(commands).toHaveLength(2)
  now = 30_001
  await lookup(input)
  expect(commands).toHaveLength(3)
})

test("coalesces lookups while one reader cancels independently", async () => {
  const deferred = Promise.withResolvers<DeploymentCommandResult>()
  const commands: DeploymentCommand[] = []
  const lookup = createGithubPullRequestClient(async (command) => {
    commands.push(command)
    return deferred.promise
  })
  const controller = new AbortController()
  const first = lookup({ ...input, signal: controller.signal })
  const second = lookup(input)
  controller.abort()
  expect(await first).toEqual({ ok: false, category: "cancelled" })
  expect(commands[0]?.signal?.aborted).toBe(false)
  deferred.resolve(success)
  expect((await second).ok).toBe(true)
  expect(commands).toHaveLength(1)
})

test("failed commands remain retryable and never leak output", async () => {
  let calls = 0
  const lookup = createGithubPullRequestClient(async () => {
    calls += 1
    if (calls === 1) return { ok: false, reason: "failed", stdout: "secret", stderr: "Run gh auth login. secret" }
    return success
  })
  expect(await lookup(input)).toEqual({ ok: false, category: "not-authenticated" })
  expect((await lookup(input)).ok).toBe(true)
  expect(calls).toBe(2)
})

test("malformed, wrong-repository and partial-key results are not trusted", async () => {
  const first = requests[0]
  if (!first) throw new Error("Missing fixture")
  const wrong = createGithubPullRequestClient(async () => ({
    ...success,
    stdout: JSON.stringify([{ ...first, url: "https://github.com/evil/shop/pull/101" }]),
  }))
  expect(await wrong(input)).toEqual({ ok: false, category: "malformed" })
  const partial = createGithubPullRequestClient(async () => ({
    ...success,
    stdout: JSON.stringify([{ ...first, headRefName: "SHOP-6170-feature" }]),
  }))
  const result = await partial(input)
  expect(result.ok && result.requests).toEqual([])
})
