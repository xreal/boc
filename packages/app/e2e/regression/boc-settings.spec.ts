import { expect, test } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const directory = "C:/OpenCode/BocSettings"

test("opens settings from a Boc dashboard", async ({ page }) => {
  await mockOpenCodeServer(page, {
    directory,
    project: {
      id: "proj_boc_settings",
      worktree: directory,
      vcs: "git",
      name: "boc-settings",
      time: { created: 1700000000000, updated: 1700000000000 },
      sandboxes: [],
    },
    provider: { all: [], connected: [], default: {} },
    sessions: [],
    pageMessages: () => ({ items: [] }),
  })
  await page.goto("/boc/controls")
  await expect(page.getByRole("heading", { name: "Project setup", exact: true })).toBeVisible()

  await page.keyboard.press("Control+,")

  await expect(page).toHaveURL("/settings")
  const settings = page.getByTestId("settings-screen")
  await expect(settings.getByRole("tab", { name: "Preferences", exact: true })).toBeVisible()
  await settings.getByRole("button", { name: "Back to app", exact: true }).click()
  await expect(page).toHaveURL("/boc/controls")
})
