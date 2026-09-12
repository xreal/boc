import { expect, test } from "bun:test"
import { fetchJiraBranches } from "./github-branch-client"
import { DEPLOYMENT_GITHUB_REPOSITORY } from "../../deployments/domain/github"

test("discovers standalone branches with a bounded authenticated query and complete issue-key matching", async () => {
  const result = await fetchJiraBranches(async (command) => {
    expect(command.args).toContain("graphql")
    expect(command.args).toContain("key=SHOP-61")
    expect(command.args.join(" ")).toContain("first:100")
    return {
      ok: true,
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        data: {
          repository: {
            refs: {
              nodes: [{ name: "SHOP-61-gallery" }, { name: "shop-61-follow-up" }, { name: "SHOP-617-other" }],
              pageInfo: { hasNextPage: true },
            },
          },
        },
      }),
    }
  }, "SHOP-61")
  expect(result).toEqual({
    ok: true,
    branches: [
      { name: "SHOP-61-gallery", url: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/tree/SHOP-61-gallery` },
      { name: "shop-61-follow-up", url: `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/tree/shop-61-follow-up` },
    ],
    truncated: true,
  })
})

test("branch failures redact CLI output and do not interpret GraphQL errors as an empty list", async () => {
  expect(
    await fetchJiraBranches(
      async () => ({ ok: true, exitCode: 0, stderr: "", stdout: '{"errors":[{"message":"private"}]}' }),
      "SHOP-61",
    ),
  ).toEqual({ ok: false, category: "malformed" })
  expect(
    await fetchJiraBranches(
      async () => ({ ok: false, reason: "failed", stderr: "gh auth login private", stdout: "" }),
      "SHOP-61",
    ),
  ).toEqual({ ok: false, category: "not-authenticated" })
})
