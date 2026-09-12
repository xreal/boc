import { expect, story } from "../../storybook/playwright/story"

story(
  "ticket action is flush with its difficulty selector and uses the chosen model",
  async ({ mount, page }, testInfo) => {
    await mount("boc-jira--sessions", { globals: { theme: "dark" } })
    const control = page.locator("[data-boc-jira-session-start]")
    await control.scrollIntoViewIfNeeded()
    const action = control.getByRole("button", { name: "Work on this ticket" })
    const difficulty = control.getByRole("button", { name: "Ticket difficulty: Medium" })
    await expect(action).toBeEnabled()
    await expect(difficulty).toHaveCSS("border-top-width", "0px")
    await expect(difficulty).toHaveCSS("border-bottom-width", "0px")
    await expect(difficulty).toHaveCSS("border-right-width", "0px")
    const bounds = await control.boundingBox()
    const selectorBounds = await difficulty.boundingBox()
    expect(selectorBounds?.height).toBe(bounds?.height)
    expect(selectorBounds?.y).toBe(bounds?.y)
    await expect(page.getByText("Review the ticket prompt and choose a project and model before sending.")).toHaveCount(
      0,
    )
    await control.locator("..").screenshot({ path: testInfo.outputPath("session-action.png") })
    await difficulty.click()
    await page.getByRole("menuitemradio", { name: /^High/ }).click()
    await expect(control.getByRole("button", { name: "Ticket difficulty: High" })).toBeVisible()
    await action.click()
    await expect(page.getByLabel("Started model")).toContainText("gpt-5.6-sol")
  },
)

story(
  "preserves Jira annotation colors and status artwork in descriptions and comments",
  async ({ mount, page }, testInfo) => {
    await mount("boc-jira--default", { globals: { theme: "dark" } })
    const documents = page.locator("[data-boc-jira-markdown]").filter({ hasText: "Dev Testing:" })
    await expect(documents).toHaveCount(2)
    for (const document of await documents.all()) {
      await document.scrollIntoViewIfNeeded()
      await expect(document.locator("strong").filter({ hasText: "Dev Testing:" })).toHaveCSS("font-weight", "700")
      await expect(document.locator("span[style]").filter({ hasText: "Waiting for email setup" })).toHaveCSS(
        "color",
        "rgb(255, 153, 31)",
      )
      await expect(document.locator('[data-jira-emoji="check-mark"]')).toHaveCSS("border-radius", "50%")
      await expect(document.locator('[data-jira-emoji="check-mark"]')).toHaveCSS(
        "background-color",
        "rgb(107, 153, 29)",
      )
      await expect(document.locator('[data-jira-emoji="information"]')).toHaveCSS(
        "background-color",
        "rgb(56, 142, 195)",
      )
    }
    await documents.last().screenshot({ path: testInfo.outputPath("jira-formatting.png") })
  },
)

story("reads comments independently of slow PRs and exposes no comment editor", async ({ mount, page }) => {
  await mount("boc-jira--slow")
  await expect(page.getByRole("heading", { name: /Keep product-gallery/ })).toBeVisible()
  const comments = page.getByRole("region", { name: "Comments", exact: true })
  await expect(comments.getByRole("article")).toHaveCount(20)
  await expect(page.getByRole("textbox", { name: "Add a comment" })).toHaveCount(0)
  await expect(
    page.getByRole("region", { name: "Pull requests", exact: true }).getByRole("button", { name: /Open pull request/ }),
  ).toHaveCount(4)
})

story("prepends older comments without losing focus or the scroll anchor", async ({ mount, page }) => {
  await mount("boc-jira--default")
  const comments = page.getByRole("region", { name: "Comments", exact: true })
  const older = comments.getByRole("button", { name: "Load older comments" })
  await older.scrollIntoViewIfNeeded()
  await older.focus()
  const first = comments.getByRole("article").first()
  const before = await first.boundingBox()
  await older.press("Enter")
  await expect(comments.getByRole("article")).toHaveCount(40)
  await expect(older).toBeFocused()
  const after = await comments.getByRole("article").filter({ hasText: "SHOP-617 discussion 26." }).boundingBox()
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(3)
})

story("assigns a duplicate-name account by keyboard and restores trigger focus", async ({ mount, page }) => {
  await mount("boc-jira--default")
  const trigger = page.getByRole("button", { name: "Change assignee", exact: true })
  await trigger.focus()
  await trigger.press("Enter")
  const search = page.getByRole("textbox", { name: "Search assignable people" })
  await expect(search).toBeFocused()
  await search.fill("reviewer")
  await expect(page.getByRole("button", { name: /Platform developer reviewer@example.invalid/ })).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("status")).toBeEmpty()
  await search.press("ArrowDown")
  await search.press("Enter")
  await expect(search).not.toBeVisible()
  await expect(page.getByLabel("Board assignee SHOP-617")).toContainText("reviewer@example.invalid")
  await expect(trigger).toBeEnabled()
  await expect(trigger).toBeFocused()
  await expect(page.getByLabel("Assignment calls", { exact: true })).toHaveText("1")
  await trigger.click()
  await page.getByRole("button", { name: /Unassigned/ }).click()
  await expect(page.getByLabel("Board assignee SHOP-617")).toContainText("Unassigned")
  await expect(page.getByLabel("Assignment calls", { exact: true })).toHaveText("2")
})

for (const scenario of ["rejected", "unknown"] as const) {
  story(`${scenario} assignment keeps server state and never retries`, async ({ mount, page }) => {
    await mount(`boc-jira--${scenario}-assignment`)
    await page.getByRole("button", { name: "Change assignee", exact: true }).click()
    const search = page.getByRole("textbox", { name: "Search assignable people" })
    await search.fill("reviewer")
    await page.getByRole("button", { name: /Platform developer reviewer@example.invalid/ }).click()
    await expect(page.getByRole("alert")).toContainText(
      scenario === "rejected" ? "Jira rejected the assignment" : "outcome could not be confirmed",
    )
    await expect(page.getByLabel("Board assignee SHOP-617")).toContainText("platform@example.invalid")
    await expect(page.getByLabel("Assignment calls", { exact: true })).toHaveText("1")
  })
}

story("retains content on refresh errors and while offline", async ({ mount, page }) => {
  await mount("boc-jira--stale")
  const comments = page.getByRole("region", { name: "Comments", exact: true })
  await expect(comments.getByRole("article")).toHaveCount(20)
  await comments.getByRole("button", { name: "Refresh Comments", exact: true }).click()
  await expect(comments.getByRole("alert")).toContainText("Showing previously loaded data")
  await expect(comments.getByRole("article")).toHaveCount(20)
  const prs = page.getByRole("region", { name: "Pull requests", exact: true })
  await prs.getByRole("button", { name: "Refresh Pull requests", exact: true }).click()
  await expect(prs.getByRole("alert")).toContainText("GitHub CLI needs sign-in")
  await expect(prs.getByRole("button", { name: /Open pull request/ })).toHaveCount(4)
  await page.getByRole("button", { name: "Go offline" }).click()
  await expect(page.getByText(/You're offline/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Change assignee", exact: true })).toBeDisabled()
  await expect(comments.getByRole("article")).toHaveCount(20)
})

story("late reads and assignment results stay with the initiating issue", async ({ mount, page }) => {
  await mount("boc-jira--switching")
  await page.getByRole("button", { name: "Change assignee", exact: true }).click()
  const search = page.getByRole("textbox", { name: "Search assignable people" })
  await search.fill("reviewer")
  await page.getByRole("button", { name: /Platform developer reviewer@example.invalid/ }).click()
  await page.getByRole("button", { name: "SHOP-618", exact: true }).click()
  const comments = page.getByRole("region", { name: "Comments", exact: true })
  await expect(comments.getByRole("article").first()).toContainText("SHOP-618 discussion")
  await expect(page.getByLabel("Board assignee SHOP-617")).toContainText("reviewer@example.invalid")
  await expect(page.getByLabel("Board assignee SHOP-618")).toContainText("platform@example.invalid")
  await expect(page.getByRole("heading", { name: /SHOP-618:/ })).toBeVisible()
})

story("PR states and external navigation remain usable in narrow RTL", async ({ mount, page }) => {
  await page.setViewportSize({ width: 540, height: 900 })
  await mount("boc-jira--narrow-rtl")
  const inspector = page.getByRole("dialog")
  const prs = inspector.getByRole("region", { name: "Pull requests", exact: true })
  for (const state of ["Open", "Draft", "Merged", "Closed"])
    await expect(prs.getByText(state, { exact: true })).toBeVisible()
  await prs.getByRole("button", { name: /Open pull request #101:/ }).click()
  await expect(page.getByLabel("Opened URL")).toHaveText("https://github.com/example/shop/pull/101")
  const bounds = await inspector.boundingBox()
  expect(bounds?.x).toBeGreaterThanOrEqual(0)
  expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(540)
})

for (const mode of [
  { locale: "en", direction: "ltr", theme: "light", width: 1280, zoom: 1 },
  { locale: "en", direction: "rtl", theme: "dark", width: 540, zoom: 1 },
  { locale: "ar", direction: "rtl", theme: "light", width: 800, zoom: 1.5 },
]) {
  story(
    `layout and picker ${mode.locale} ${mode.direction} ${mode.theme} ${mode.zoom}`,
    async ({ mount, page }, testInfo) => {
      const width = Math.floor(mode.width / mode.zoom)
      await page.setViewportSize({ width, height: Math.floor(900 / mode.zoom) })
      const session = await page.context().newCDPSession(page)
      // Browser zoom changes CSS viewport dimensions and pixel density together.
      await session.send("Emulation.setDeviceMetricsOverride", {
        width,
        height: Math.floor(900 / mode.zoom),
        deviceScaleFactor: mode.zoom,
        mobile: false,
      })
      await mount("boc-jira--default", {
        globals: { locale: mode.locale, direction: mode.direction, theme: mode.theme },
      })
      await expect(page.locator("html")).toHaveAttribute("dir", mode.direction)
      await page.getByRole("button", { name: "Change assignee", exact: true }).click()
      const search = page.getByRole("textbox", { name: "Search assignable people" })
      await expect(search).toBeFocused()
      await search.fill("team")
      const mixed = page.getByRole("button", { name: /فريق التطوير/ })
      await expect(mixed).toBeVisible()
      await expect(page.getByRole("dialog", { name: "Change assignee" }).getByRole("status")).toBeEmpty()
      const bounds = await search.boundingBox()
      expect(bounds?.x).toBeGreaterThanOrEqual(0)
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath("picker.png") })
      await search.press("Escape")
      await expect(page.getByRole("button", { name: "Change assignee", exact: true })).toBeFocused()
      await page.getByRole("region", { name: "Pull requests", exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath("inspector.png") })
    },
  )
}
