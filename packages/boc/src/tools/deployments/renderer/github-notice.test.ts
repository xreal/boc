import { describe, expect, test } from "bun:test"
import { deploymentGithubNotice } from "./github-notice"

describe("deployment GitHub notice", () => {
  test("reports the first unavailable GitHub boundary", () => {
    expect(
      deploymentGithubNotice({
        capabilities: [
          { capability: "gh_cli", status: "available" },
          { capability: "github_auth", status: "available" },
          { capability: "github_repo_access", status: "unavailable", failure: "permission" },
          { capability: "github_workflow_dispatch", status: "unknown" },
        ],
      }),
    ).toBe("access")
  })

  test("stays hidden when GitHub is ready or not checked", () => {
    expect(
      deploymentGithubNotice({
        capabilities: [
          { capability: "gh_cli", status: "available" },
          { capability: "github_auth", status: "available" },
          { capability: "github_repo_access", status: "available" },
          { capability: "github_workflow_dispatch", status: "available" },
        ],
      }),
    ).toBeUndefined()
    expect(
      deploymentGithubNotice({
        capabilities: [{ capability: "github_repo_access", status: "unknown" }],
      }),
    ).toBeUndefined()
  })
})
