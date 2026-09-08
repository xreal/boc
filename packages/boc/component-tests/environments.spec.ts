import { expect, story } from "../../storybook/playwright/story"

for (const globals of [
  { theme: "light", direction: "ltr", locale: "en" },
  { theme: "dark", direction: "rtl", locale: "en" },
  { theme: "dark", direction: "rtl", locale: "ar" },
]) {
  story(
    `distinguishes readiness states in ${globals.theme}/${globals.direction}/${globals.locale}`,
    async ({ mount, page }) => {
      const component = await mount("boc-development-environments--partial", { globals })
      await component.getByRole("button", { name: "View environment output", exact: true }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog.getByRole("group", { name: "Stack", exact: true })).toContainText(
        "Stack assignment is configured",
      )
      for (const [label, tone] of [
        ["Stack", "success"],
        ["Containers", "warning"],
        ["Application", "danger"],
      ]) {
        const card = dialog.getByRole("group", { name: label, exact: true })
        await expect(card).toBeVisible()
        expect(
          await card.evaluate((element, tone) => {
            const probe = document.createElement("span")
            probe.style.color = `var(--v2-state-fg-${tone})`
            element.append(probe)
            const expected = getComputedStyle(probe).color
            probe.remove()
            return getComputedStyle(element).color === expected
          }, tone),
        ).toBe(true)
      }
      await expect(dialog.getByRole("log")).toHaveCSS("direction", "ltr")
      await story.info().attach("environment-status", { body: await dialog.screenshot(), contentType: "image/png" })
      await page.keyboard.press("Escape")
      await expect(component.getByRole("button", { name: "View environment output", exact: true })).toBeFocused()
    },
  )
}

story("opens the session menu group and exposes the checkout path", async ({ mount, page }) => {
  const component = await mount("boc-development-environments--context-menu")
  await component.getByRole("button", { name: "Session menu" }).click()
  await expect(page.getByRole("menuitem", { name: "Copy checkout path" })).toBeEnabled()
  await page.getByRole("menuitem", { name: "View environment output" }).click()
  await expect(page.getByRole("dialog")).toContainText("Application responded successfully")
})

story("keeps the full button label readable and strips PTY controls from output", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  const component = await mount("boc-development-environments--stopped")
  const primary = component.getByRole("button", { name: "Start environment", exact: true })
  await expect(primary).toBeEnabled()
  expect(await primary.evaluate((button) => button.clientWidth >= button.scrollWidth && button.clientWidth > 28)).toBe(
    true,
  )
  await component.getByRole("button", { name: "Environment actions" }).click()
  await page.getByRole("menuitem", { name: "View environment output" }).click()
  const output = page.getByRole("log", { name: "Recent output" })
  await expect(output).toContainText("Stopped 6 containers.")
  await expect(output).not.toContainText("[32m")
  await expect(output).not.toContainText("[?25l")
  await expect(output).toHaveCSS("direction", "ltr")
  await expect(output).toHaveCSS("font-size", "12px")
  await expect(page.getByRole("dialog").getByRole("status")).toBeInViewport()
})

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
