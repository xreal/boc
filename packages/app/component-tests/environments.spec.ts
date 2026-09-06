import { expect, story } from "../../storybook/playwright/story"

story("shows honest running actions and returns focus after Escape", async ({ mount, page }) => {
  const component = await mount("boc-development-environments--setup-running")
  const primary = component.getByRole("button", { name: "View environment output" })

  await component.getByRole("button", { name: "Environment actions" }).click()
  await expect(page.getByRole("menuitem", { name: "Cancel current run" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Remove environment" })).toHaveCount(0)
  await page.getByRole("menuitem", { name: "View environment output" }).click()

  await expect(page.getByRole("dialog")).toContainText("Setup is running")
  await page.keyboard.press("Escape")
  await expect(primary).toBeFocused()
})

story("offers one retry path and confirms removal scope", async ({ mount, page }) => {
  const component = await mount("boc-development-environments--setup-failed")

  await component.getByRole("button", { name: "Environment actions" }).click()
  await expect(page.getByRole("menuitem", { name: "Retry Setup" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Set up environment" })).toHaveCount(0)
  await page.getByRole("menuitem", { name: "Retry Setup" }).click()

  await expect(page.getByRole("dialog")).toContainText("Setup is running")
  await expect(page.getByRole("button", { name: "Cancel current run" })).toBeVisible()
  await page.keyboard.press("Escape")

  const running = await mount("boc-development-environments--running")

  await running.getByRole("button", { name: "Environment actions" }).click()
  await page.getByRole("menuitem", { name: "Remove environment" }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toContainText("Checkout files and shared services remain.")
  await expect(dialog.getByRole("button", { name: "Remove environment" })).toBeVisible()
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(running.getByRole("button", { name: "Open in browser" })).toBeFocused()
})
