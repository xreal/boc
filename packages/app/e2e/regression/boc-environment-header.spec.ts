import { base64Encode } from "@opencode/util/encode"
import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { expectSessionTitle } from "../utils/waits"

const projectDirectory = "C:/OpenCode/LaneHeader"
const directory = `${projectDirectory}/.lane/trees/header-layout`
const sessionID = "ses_boc_environment_header"
const server = `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`

test.beforeEach(async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory: projectDirectory,
    project: {
      id: "proj_boc_environment_header",
      worktree: projectDirectory,
      vcs: "git",
      name: "lane-header",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [directory],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [
      {
        id: sessionID,
        slug: "boc-environment-header",
        projectID: "proj_boc_environment_header",
        directory,
        title: "Lane header layout",
        version: "dev",
        time: { created: 1700000000000, updated: 1700000000000 },
      },
    ],
    pageMessages: () => ({ items: [] }),
  })
})

for (const width of [1000, 1440]) {
  for (const direction of ["ltr", "rtl"] as const) {
    test(`keeps Lane actions clear of session details (${width}px, ${direction})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript((worktree) => {
        localStorage.setItem(
          "opencode.global.dat:server",
          JSON.stringify({
            list: [],
            hidden: {},
            projects: { local: [{ worktree, expanded: true }] },
            lastProject: {},
            recentlyClosed: {},
          }),
        )
      }, projectDirectory)
      await page.goto(`/server/${base64Encode(server)}/session/${sessionID}`)
      await expectSessionTitle(page, "Lane header layout")
      await page.locator("html").evaluate((element, dir) => element.setAttribute("dir", dir), direction)

      const environment = page.locator("[data-boc-environment-control]")
      const details = page.getByRole("button", { name: "Session details", exact: true })
      await expect(environment).toBeVisible()
      await expect(details).toBeVisible()
      await expect
        .poll(async () => {
          const environmentBox = await environment.boundingBox()
          const detailsBox = await details.boundingBox()
          if (!environmentBox || !detailsBox) return false
          return (
            environmentBox.x + environmentBox.width <= detailsBox.x ||
            detailsBox.x + detailsBox.width <= environmentBox.x
          )
        })
        .toBe(true)
    })
  }
}
