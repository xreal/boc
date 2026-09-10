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
      await expect(dialog.getByText("4/6 running", { exact: true })).toBeVisible()
      await expect(dialog.getByText("Application unreachable", { exact: true })).toBeVisible()
      const unhealthy = dialog.getByRole("row").filter({ hasText: "ssr" })
      await expect(unhealthy).toContainText("Running")
      await expect(unhealthy).toContainText("Unhealthy")
      await expect(dialog.getByRole("button", { name: "Start api-php83", exact: true })).toBeEnabled()
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
  await expect(page.getByRole("menuitem", { name: "Open in browser", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Open in browser", exact: true })).toHaveAttribute(
    "aria-description",
    "Environment is running",
  )
  await expect(page.getByRole("menuitem", { name: "View environment output" })).not.toBeVisible()
  await page.getByRole("menuitem", { name: "Development environment", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.getByRole("menuitem", { name: "Open in browser", exact: true })).toHaveCount(1)
  await page.getByRole("menuitem", { name: "View environment output" }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog")).toContainText("Application ready")
})

story("keeps the full button label readable and renders PTY controls in Ghostty", async ({ mount, page }) => {
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
  await expect(page.locator(".boc-environment-terminal canvas")).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("status")).toBeInViewport()
})

story("controls a single service, follows its logs, and keeps completion in place", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const component = await mount("boc-development-environments--partial")
  await component.getByRole("button", { name: "View environment output", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByText("devenv-boc-204-environments-shop-1", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "View logs for shop", exact: true }).click()
  await expect(dialog.getByRole("combobox", { name: "Output", exact: true })).toHaveValue("container-shop")
  const logs = dialog.getByRole("log", { name: "Container logs" })
  await expect(logs).toContainText("GET / 200")
  await dialog.getByRole("searchbox").fill("Listening")
  await expect(logs).toContainText("Listening on port 3000")
  await expect(logs).not.toContainText("GET / 200")
  const before = await dialog.locator(".boc-environment-footer").boundingBox()
  await dialog.getByRole("button", { name: "Stop shop", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Start all", exact: true })).toBeDisabled()
  await expect(dialog.getByRole("status")).toHaveText("shop · Stop completed")
  await expect(dialog.getByRole("button", { name: "Start shop", exact: true })).toBeEnabled()
  expect(await dialog.locator(".boc-environment-footer").boundingBox()).toEqual(before)
})

story("offers both lifecycle actions for a partially running checkout", async ({ mount, page }) => {
  const component = await mount("boc-development-environments--partial")
  await component.getByRole("button", { name: "Environment actions", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Start all", exact: true })).toBeEnabled()
  await expect(page.getByRole("menuitem", { name: "Stop all", exact: true })).toBeEnabled()
  await expect(page.getByRole("menuitem", { name: "Set up again + clear shared Redis", exact: true })).toBeVisible()
})

story("replays terminal redraws once, preserves scrollback and keeps the terminal mounted", async ({ mount, page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const component = await mount("boc-development-environments--live-output")
  await component.getByRole("button", { name: "View environment output", exact: true }).click()
  const dialog = page.getByRole("dialog")
  const log = dialog.getByRole("log", { name: "Recent output", exact: true })
  await expect(log).toContainText("Container shop Started")
  expect((await log.textContent())?.match(/Container shop Started/g)).toHaveLength(1)
  const terminal = dialog.locator(".boc-environment-terminal canvas")
  await terminal.evaluate((element) => element.setAttribute("data-preserved", "true"))
  await terminal.hover()
  await page.mouse.wheel(0, -500)
  await expect(dialog.getByRole("button", { name: "Jump to latest", exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Refresh status", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Refresh status", exact: true })).toBeEnabled()
  await expect(dialog.getByRole("button", { name: "Jump to latest", exact: true })).toBeVisible()
  await expect(terminal).toHaveAttribute("data-preserved", "true")
  expect((await log.textContent())?.match(/Container shop Started/g)).toHaveLength(1)
  await dialog.getByRole("button", { name: "Jump to latest", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true")
})

story("keeps service actions and the footer reachable on a narrow screen", async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const component = await mount("boc-development-environments--partial", {
    globals: { direction: "rtl", locale: "en", theme: "dark" },
  })
  await component.getByRole("button", { name: "View environment output", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport()
  await expect(dialog.getByRole("button", { name: "Stop shop", exact: true })).toBeInViewport()
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await dialog.getByRole("button", { name: "Actions for shop", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "Restart", exact: true })).toBeVisible()
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
