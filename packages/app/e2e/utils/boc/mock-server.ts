import type { Page } from "@playwright/test"
import { BocControls } from "@opencode/schema/boc/controls"
import { mockOpenCodeServer, type MockServerConfig } from "../mock-server"

// Register only the reads these Boc screens use; unexpected requests still fail in the strict shared mock.
export async function mockBocServer(
  page: Page,
  config: MockServerConfig & { project: { id: string; worktree: string } },
) {
  const mock = await mockOpenCodeServer(page, config)
  await page.route("**/api/vcs/base?*", (route) =>
    route.fulfill({ json: { location: { directory: config.directory }, data: null } }),
  )

  const info = {
    protocol: 2,
    version: "2.0.27",
    project: { id: config.project.id, canonical: config.project.worktree },
    location: { directory: config.directory },
    source: "bundled",
    scope: "project-on-server",
    categories: BocControls.kinds,
    operations: ["getState"],
  }

  await page.route("**/api/rpc/boc.controls.v1/info?*", (route) => route.fulfill({ json: { output: info } }))
  await page.route("**/api/rpc/boc.controls.v1/getState?*", (route) =>
    route.fulfill({ json: { output: { info, revision: 0, items: [], incomplete: [] } } }),
  )

  return mock
}
