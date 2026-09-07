import { expect, story } from "../../storybook/playwright/story"

story("applies a keyboard toggle and preserves focus on the capability", async ({ mount, page }) => {
  const component = await mount("boc-bergflow--default")
  const toggle = component.getByRole("switch", { name: "Review changes" })
  await toggle.focus()
  await page.keyboard.press("Space")
  await expect(component.getByText("Disabled here", { exact: true })).toBeVisible()
  await expect(toggle).toBeFocused()
  await expect(toggle).not.toBeChecked()
  await expect(component.getByRole("switch", { name: "Build", exact: true })).toHaveCount(0)
  await component.getByRole("textbox", { name: "Search capabilities" }).fill("no matching capability")
  await expect(component.getByText("No capabilities match your search.")).toBeVisible()
  await component.getByRole("button", { name: "Clear filters" }).click()
  await expect(toggle).toBeVisible()
})

story("keeps server, project, and worktree visible on a narrow screen", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 850 })
  const component = await mount("boc-bergflow--default")
  await expect(component.getByLabel("Server", { exact: true })).toBeVisible()
  await expect(component.getByLabel("Project", { exact: true })).toBeVisible()
  await expect(component.getByLabel("Worktree", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375)
})
