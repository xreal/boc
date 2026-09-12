import { describe, expect, test } from "bun:test"
import {
  DEPLOYMENT_GITHUB_REPOSITORY,
  dispatchGithubWorkflow,
  githubAuthStatusArgs,
  githubReadiness,
  githubWorkflowRunArgs,
  listGithubBranches,
  listGithubWorkflowTargets,
  parseGithubWorkflowRun,
  validateGithubRef,
} from "./github-cli"
import type { DeploymentCommand, DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"
import { deploymentShopWorkflowYaml, deploymentUnsupportedWorkflowYaml } from "../fixtures/github"

describe("GitHub CLI boundary", () => {
  test("never retrieves a token and uses the fixed repository", async () => {
    const commands: DeploymentCommand[] = []
    const result = await githubReadiness({
      run: scriptedRunner(commands, [
        success("gh version 2.100.0 (2026-09-03)"),
        success("Logged in to github.com"),
        success(JSON.stringify({ full_name: DEPLOYMENT_GITHUB_REPOSITORY })),
        success(
          JSON.stringify([
            { name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" },
            { name: "CI", path: ".github/workflows/ci.yml", state: "active" },
            { name: "Old", path: ".github/workflows/app-old.yml", state: "disabled" },
          ]),
        ),
      ]),
    })

    expect(result.ok).toBe(true)
    expect(commands.map((command) => [command.executable, ...command.args])).toEqual([
      ["gh", "--version"],
      ["gh", ...githubAuthStatusArgs()],
      ["gh", "api", `repos/${DEPLOYMENT_GITHUB_REPOSITORY}`],
      ["gh", "workflow", "list", "--repo", DEPLOYMENT_GITHUB_REPOSITORY, "--json", "name,path,state", "--limit", "100"],
    ])
    expect(JSON.stringify(commands)).not.toMatch(/auth token|--show-token|GH_TOKEN|gho_/)
    expect(commands.every((command) => command.env?.GH_TOKEN === undefined)).toBe(true)
  })

  test("classifies auth, repository, and Actions permission failures without leaking diagnostics", async () => {
    const missing = await githubReadiness({
      run: scriptedRunner([], [{ ok: false, reason: "not-found", stdout: "", stderr: "gh missing secret" }]),
    })
    expect(missing).toMatchObject({ ok: false, failure: { category: "missing-cli", capability: "gh_cli" } })
    expect(JSON.stringify(missing)).not.toContain("secret")

    const auth = await githubReadiness({
      run: scriptedRunner(
        [],
        [
          success("gh version 2.100.0"),
          { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "not logged in token=gho_secret" },
        ],
      ),
    })
    expect(auth).toMatchObject({ ok: false, failure: { category: "not-authenticated", capability: "github_auth" } })
    expect(JSON.stringify(auth)).not.toContain("gho_secret")

    const permission = await githubReadiness({
      run: scriptedRunner(
        [],
        [
          success("gh version 2.100.0"),
          success("ok"),
          { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "HTTP 404 Not Found" },
        ],
      ),
    })
    expect(permission).toMatchObject({
      ok: false,
      failure: { category: "not-found", capability: "github_repo_access" },
    })
  })

  test("bounds branch search and requires an exact ref", async () => {
    const commands: DeploymentCommand[] = []
    const short = await listGithubBranches({ run: scriptedRunner(commands, []) }, "S")
    expect(short).toEqual({ ok: true, branches: [] })
    expect(commands).toEqual([])

    const listed = await listGithubBranches(
      {
        run: scriptedRunner(commands, [
          success(
            JSON.stringify({
              data: {
                repository: {
                  refs: { nodes: [{ name: "SHOP-42" }, { name: "SHOP-42-extra" }, { name: "master" }] },
                },
              },
            }),
          ),
        ]),
      },
      "SHOP",
    )
    expect(listed).toEqual({ ok: true, branches: ["SHOP-42", "SHOP-42-extra", "master"] })
    expect(commands[0]?.args).toContain(`q=SHOP`)
    expect(commands[0]?.args.join(" ")).not.toContain("--repo")

    const exact = await validateGithubRef(
      {
        run: scriptedRunner([], [success(JSON.stringify({ ref: "refs/heads/SHOP-42-extra" }))]),
      },
      "SHOP-42",
    )
    expect(exact).toMatchObject({ ok: false, category: "not-found" })
  })

  test("validates an exact branch without relying on the capped suggestion search", async () => {
    const commands: DeploymentCommand[] = []
    const exact = await validateGithubRef(
      { run: scriptedRunner(commands, [success(JSON.stringify({ ref: "refs/heads/SHOP-999" }))]) },
      " SHOP-999 ",
    )

    expect(exact).toEqual({ ok: true, ref: "SHOP-999" })
    expect(commands[0]?.args).toEqual(["api", `repos/${DEPLOYMENT_GITHUB_REPOSITORY}/git/ref/heads/SHOP-999`])
  })

  test("keeps only active app-*.ya?ml workflow contracts and blocks required unknown inputs", async () => {
    const listed = await listGithubWorkflowTargets({
      run: scriptedRunner(
        [],
        [
          success(
            JSON.stringify([
              { name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" },
              { name: "Billing", path: ".github/workflows/app-billing.yml", state: "active" },
              { name: "CI", path: ".github/workflows/ci.yml", state: "active" },
              { name: "Legacy", path: "../app-shop.yml", state: "active" },
            ]),
          ),
          success(deploymentShopWorkflowYaml),
          success(deploymentUnsupportedWorkflowYaml),
        ],
      ),
    })
    expect(listed.ok).toBe(true)
    if (!listed.ok) throw new Error("expected targets")
    expect(listed.targets.map((target) => target.target.filename)).toEqual(["app-shop.yml", "app-billing.yml"])
    expect(listed.targets[1]?.issues).toEqual([{ name: "note", reason: "unsupported" }])
  })

  test("fails workflow discovery when an active workflow cannot be read", async () => {
    const listed = await listGithubWorkflowTargets({
      run: scriptedRunner(
        [],
        [
          success(JSON.stringify([{ name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" }])),
          { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "temporary failure" },
        ],
      ),
    })

    expect(listed).toMatchObject({ ok: false, capability: "github_workflow_dispatch" })
  })

  test("skips active workflows that do not exist on an older selected branch", async () => {
    const listed = await listGithubWorkflowTargets(
      {
        run: scriptedRunner(
          [],
          [
            success(
              JSON.stringify([
                { name: "Shop", path: ".github/workflows/app-shop.yml", state: "active" },
                { name: "SAP", path: ".github/workflows/app-api-sap.yml", state: "active" },
              ]),
            ),
            success(deploymentShopWorkflowYaml),
            {
              ok: false,
              reason: "failed",
              exitCode: 1,
              stdout: "",
              stderr: "could not find workflow file app-api-sap.yml on SHOP-42, try specifying a different ref",
            },
            success(JSON.stringify({ ref: "refs/heads/SHOP-42" })),
          ],
        ),
      },
      "SHOP-42",
    )

    expect(listed).toMatchObject({ ok: true, targets: [{ target: { filename: "app-shop.yml" } }] })
  })

  test("dispatches through stdin JSON on the fixed repo and treats missing run URLs as unknown", async () => {
    const commands: DeploymentCommand[] = []
    const dispatched = await dispatchGithubWorkflow(
      {
        run: scriptedRunner(commands, [success("Queued\nhttps://github.com/bergfreunde/shop/actions/runs/8421042\n")]),
      },
      { filename: "app-shop.yml", ref: "SHOP-42", inputs: { perform_tests: true, force_rebuild: false } },
    )
    expect(dispatched).toEqual({
      ok: true,
      runId: "8421042",
      runUrl: "https://github.com/bergfreunde/shop/actions/runs/8421042",
    })
    expect(commands[0]?.args).toEqual([...githubWorkflowRunArgs("app-shop.yml", "SHOP-42")])
    expect(commands[0]?.stdin).toBe(JSON.stringify({ perform_tests: "true", force_rebuild: "false" }))
    expect(commands[0]?.args.join(" ")).not.toContain("perform_tests")
    expect(parseGithubWorkflowRun("https://github.com/other/shop/actions/runs/1")).toBeUndefined()
    expect(
      await dispatchGithubWorkflow(
        { run: scriptedRunner([], [success("accepted without a url")]) },
        { filename: "app-shop.yml", ref: "SHOP-42", inputs: {} },
      ),
    ).toEqual({ ok: true })
  })

  test("cancels superseded branch search without returning a late result", async () => {
    const controller = new AbortController()
    const result = listGithubBranches(
      {
        run: async (command) => {
          if (command.signal?.aborted) return { ok: false, reason: "cancelled", stdout: "", stderr: "" }
          return new Promise((resolve) => {
            command.signal?.addEventListener("abort", () => {
              resolve({ ok: false, reason: "cancelled", stdout: "", stderr: "" })
            })
          })
        },
      },
      "SHOP",
      controller.signal,
    )
    controller.abort()
    expect(await result).toMatchObject({ ok: false, category: "cancelled" })
  })
})

function success(stdout: string): DeploymentCommandResult {
  return { ok: true, exitCode: 0, stdout, stderr: "" }
}

function scriptedRunner(commands: DeploymentCommand[], results: DeploymentCommandResult[]): DeploymentCommandRunner {
  return async (command) => {
    commands.push(command)
    const result = results.shift()
    if (!result) throw new Error(`Unexpected command: ${command.executable} ${command.args.join(" ")}`)
    return result
  }
}
