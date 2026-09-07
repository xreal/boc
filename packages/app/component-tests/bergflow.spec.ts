import { expect, story } from "../../storybook/playwright/story"

story("places origin icons before names and focuses search with Ctrl/Cmd+F", async ({ mount, page }) => {
  const component = await mount("boc-bergflow--default")
  for (const [name, origin] of [
    ["OpenCode guide", "System"],
    ["Global review", "Global"],
    ["Review changes", "Project"],
  ]) {
    const heading = component.getByRole("heading", { name, exact: true })
    await expect(heading.getByRole("img", { name: new RegExp(`^${origin} ·`) })).toBeVisible()
  }
  const search = component.getByRole("textbox", { name: "Search capabilities" })
  await page.keyboard.press("Control+f")
  await expect(search).toBeFocused()
  await search.fill("review")
  await component.getByRole("heading", { name: "Project Controls", exact: true }).click()
  await page.keyboard.press("Meta+f")
  await expect(search).toBeFocused()
  await page.keyboard.type("OpenCode guide")
  await expect(search).toHaveValue("OpenCode guide")
  await expect(component.getByRole("heading", { name: "Review changes", exact: true })).toHaveCount(0)
  const input = component.locator('[data-component="text-input-v2"]')
  await expect(input).toHaveCSS("outline-width", "1px")
  await expect(input).toHaveCSS("outline-offset", "0px")
})

story("applies a keyboard toggle and preserves focus on the capability", async ({ mount, page }) => {
  const component = await mount("boc-bergflow--default")
  const toggle = component.getByRole("switch", { name: "Review changes" })
  await toggle.focus()
  await page.keyboard.press("Space")
  await expect(component.getByText("Disabled here", { exact: true })).toBeVisible()
  await expect(toggle).toBeFocused()
  await expect(toggle).not.toBeChecked()
  await expect(component.getByRole("switch", { name: "Build", exact: true })).toHaveCount(0)
  await expect(
    component.getByText("Agent switching is not supported by this Bergflow version. Agents are shown for reference."),
  ).toBeVisible()
  await component.getByRole("button", { name: "Instructions 1", exact: true }).click()
  await expect(component.getByRole("heading", { name: "AGENTS.md", exact: true })).toBeVisible()
  await expect(component.getByRole("switch", { name: "AGENTS.md", exact: true })).toBeChecked()
  await expect(
    component.getByText(
      "Project files affect future automatic instruction loads. Instructions already in session history and nested instructions loaded while reading files are unchanged.",
    ),
  ).toBeVisible()
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
