import { expect, story } from "../../storybook/playwright/story"

story("board cards offer new chat and ticket work from a context menu", async ({ mount, page }) => {
  await mount("boc-jira--card-menu")
  const card = page.locator('[data-boc-issue-card="SHOP-617"]')

  await card.click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "New chat", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "Work on this ticket", exact: true })).toBeVisible()
  await page.getByRole("menuitem", { name: "New chat", exact: true }).click()
  await expect(page.getByLabel("Started card action")).toHaveText("new")

  await card.focus()
  await page.keyboard.press("Shift+F10")
  await page.getByRole("menuitem", { name: "Work on this ticket", exact: true }).click()
  await expect(page.getByLabel("Started card action")).toHaveText("work")
})

story(
  "compact header keeps identity and copying while properties show priority and story points",
  async ({ mount, page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await mount("boc-jira--modal")
    const header = page.locator(".jira-ticket-header")
    await expect(header.locator(".jira-ticket-topic")).toContainText("SHOP-617")
    await expect(header.locator(".jira-ticket-topic")).toContainText(
      "Keep product-gallery navigation consistent across layouts",
    )
    await expect(header.locator('[title="Story"]')).toBeVisible()
    const properties = page.getByLabel("Properties", { exact: true })
    await expect(properties.getByText("Medium", { exact: true })).toBeVisible()
    await expect(properties.getByLabel("Story points", { exact: true })).toHaveText("5 SP")
    await expect(page.getByRole("button", { name: "Copy link", exact: true })).toHaveCount(0)
    await header.getByRole("button", { name: "Copy ticket key and title", exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "SHOP-617: Keep product-gallery navigation consistent across layouts",
    )
    await expect(page.locator(".jira-ticket-work")).toHaveCSS("width", "378px")
  },
)

story(
  "narrow desktop modal clears native window controls and keeps its close action reachable",
  async ({ mount, page }) => {
    await page.setViewportSize({ width: 390, height: 700 })
    await mount("boc-jira--desktop-modal")
    const modal = page.getByRole("dialog", { name: "SHOP-617", exact: true })
    const bounds = await modal.boundingBox()
    expect(bounds?.y).toBeGreaterThanOrEqual(36)
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(700)
    await expect(modal.getByRole("button", { name: "Open in Jira", exact: true })).toBeInViewport()
    expect(
      await page.locator(".jira-ticket-header").evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await modal.getByRole("button", { name: "Close issue", exact: true }).click()
    await expect(modal).not.toBeVisible()
  },
)

story("modal keeps the working rail visible while reading a long ticket", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mount("boc-jira--long-ticket", { globals: { theme: "dark" } })
  const modal = page.getByRole("dialog", { name: "SHOP-617", exact: true })
  const start = modal.getByRole("button", { name: "Work on this ticket", exact: true })
  await expect(start).toBeInViewport()
  await expect(
    modal.getByRole("region", { name: "Agent Sessions" }).getByRole("button", { name: /Implement gallery navigation/ }),
  ).toBeVisible()
  await expect(modal.getByLabel("2 sessions", { exact: true })).toBeVisible()
  const before = await start.boundingBox()
  await modal.getByRole("heading", { name: "Verification 15", exact: true }).scrollIntoViewIfNeeded()
  expect((await start.boundingBox())?.y).toBe(before?.y)
  await expect(start).toBeInViewport()
  await modal.locator(".jira-ticket-document").evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: testInfo.outputPath("ticket-modal.png") })
})

story("linked tickets reuse the modal and Back restores the reading position", async ({ mount, page }) => {
  await mount("boc-jira--long-ticket")
  const linked = page.getByRole("button", { name: /SHOP-619 Gallery API response/ })
  await linked.scrollIntoViewIfNeeded()
  const position = await page.locator(".jira-ticket-document").evaluate((element) => element.scrollTop)
  await linked.click()
  await expect(page.locator(".jira-ticket-topic")).toContainText("SHOP-619")
  await expect(page.getByRole("dialog")).toHaveCount(1)
  await page.getByRole("button", { name: "Back to previous ticket" }).click()
  await expect(page.locator(".jira-ticket-topic")).toContainText("SHOP-617")
  await expect
    .poll(() => page.locator(".jira-ticket-document").evaluate((element) => element.scrollTop))
    .toBeCloseTo(position, 0)
})

story("assignment in the workspace preserves the document reading position", async ({ mount, page }) => {
  await mount("boc-jira--long-ticket")
  await page.getByRole("heading", { name: "Verification 15", exact: true }).scrollIntoViewIfNeeded()
  const position = await page.locator(".jira-ticket-document").evaluate((element) => element.scrollTop)
  await page.getByRole("button", { name: "Change assignee", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "Search assignable people" })).toBeFocused()
  await page.getByRole("textbox", { name: "Search assignable people" }).fill("reviewer")
  await page.getByRole("button", { name: /Platform developer reviewer@example.invalid/ }).click()
  await expect(page.getByLabel("Board assignee SHOP-617")).toContainText("reviewer@example.invalid")
  expect(await page.locator(".jira-ticket-document").evaluate((element) => element.scrollTop)).toBeCloseTo(position, 0)
})

story("attachment preview stacks over the ticket and downloads through the attachment API", async ({ mount, page }) => {
  await mount("boc-jira--modal")
  const preview = page.getByRole("button", { name: "Preview gallery-layout.png", exact: true })
  await preview.scrollIntoViewIfNeeded()
  await expect(preview.locator("img")).toBeVisible()
  await preview.click()
  const imageDialog = page.getByRole("dialog", { name: "gallery-layout.png", exact: true })
  await expect(imageDialog.getByRole("img", { name: "gallery-layout.png", exact: true })).toBeVisible()
  await imageDialog.getByRole("button", { name: "Download", exact: true }).click()
  await expect(imageDialog.getByRole("status")).toHaveText("Saved gallery-layout.png")
  await page.keyboard.press("Escape")
  await expect(imageDialog).not.toBeVisible()
  await expect(page.getByRole("dialog", { name: "SHOP-617", exact: true })).toBeVisible()
  await expect(preview).toBeFocused()
  await page.getByRole("button", { name: "Download test-results.pdf", exact: true }).last().click()
  await expect(page.getByRole("region", { name: "Attachments", exact: true }).getByRole("status")).toHaveText(
    "Saved test-results.pdf",
  )
})

story("attachment failures expose retry and do not close the ticket", async ({ mount, page }) => {
  await mount("boc-jira--failed")
  await page.getByRole("button", { name: "Preview gallery-layout.png", exact: true }).click()
  const preview = page.getByRole("dialog", { name: "gallery-layout.png", exact: true })
  await expect(preview.getByRole("alert")).toBeVisible()
  await expect(preview.getByRole("button", { name: "Retry" })).toBeEnabled()
  await preview.getByRole("button", { name: "Retry" }).click()
  await expect(preview.getByRole("alert")).toBeVisible()
})

story("workspace opens branches, returns from deployment and reopens a linked Boc session", async ({ mount, page }) => {
  await mount("boc-jira--modal")
  const branches = page.getByRole("region", { name: "Branches", exact: true })
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await branches.getByRole("button", { name: "Copy branch SHOP-617-gallery-navigation", exact: true }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("SHOP-617-gallery-navigation")
  await branches.getByRole("button", { name: "Open branch SHOP-617-gallery-navigation in GitHub", exact: true }).click()
  await expect(page.getByLabel("Opened URL")).toHaveText(
    "https://github.com/example/shop/tree/SHOP-617-gallery-navigation",
  )
  await expect(page.getByRole("region", { name: "Deployments", exact: true })).toBeVisible()
  await branches.getByRole("button", { name: "Deploy branch SHOP-617-gallery-navigation", exact: true }).click()
  const deployment = page.getByRole("dialog", { name: "Fixture deployment" })
  await expect(deployment).toBeVisible()
  await expect(deployment.getByLabel("Deployment branch")).toHaveText("SHOP-617-gallery-navigation")
  await page.keyboard.press("Escape")
  await expect(page.locator('[data-slot="dialog-content"]').filter({ hasText: "Fixture deployment" })).toHaveCount(0)
  await page
    .getByRole("region", { name: "Agent Sessions" })
    .getByRole("button", { name: /Implement gallery navigation/ })
    .click()
  await expect(page.getByLabel("Opened session")).toHaveText("session-1")
  await expect(page.getByRole("dialog")).toHaveCount(0)
})

story("tickets without deployments hide the deployment section", async ({ mount, page }) => {
  await mount("boc-jira--empty")
  await expect(page.getByRole("region", { name: "Branches", exact: true })).toBeVisible()
  await expect(page.getByRole("region", { name: "Deployments", exact: true })).toHaveCount(0)
})

story("modal start hands off to the composer and close restores the opener focus", async ({ mount, page }) => {
  await mount("boc-jira--modal")
  await page.getByRole("button", { name: "Work on this ticket", exact: true }).click()
  await expect(page.getByLabel("Started model")).toContainText("gemini-3.8-flash")
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.getByRole("button", { name: "Open ticket", exact: true }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: "Open ticket", exact: true })).toBeFocused()
})

story(
  "pull requests offer one review action that starts a session with the saved template",
  async ({ mount, page }) => {
    await mount("boc-jira--sessions")
    const pullRequests = page.getByRole("region", { name: "Pull requests", exact: true })
    await expect(pullRequests.getByRole("button", { name: "Review", exact: true })).toHaveCount(4)
    await expect(pullRequests.getByRole("button", { name: "Light review", exact: true })).toHaveCount(0)
    await expect(pullRequests.getByRole("button", { name: "Deep review", exact: true })).toHaveCount(0)
    await pullRequests.getByRole("button", { name: "Review", exact: true }).first().click()
    await expect(page.getByLabel("Started model")).toContainText("gemini-3.8-flash")
    await expect(page.getByLabel("Started prompt")).toContainText("Review the pull request below.")
    await expect(page.getByLabel("Started prompt")).toContainText("https://github.com/example/shop/pull/101")
    await expect(page.getByLabel("Started prompt")).toContainText("https://example.atlassian.net/browse/SHOP-617")
  },
)

story("narrow RTL has a direct workspace jump and no horizontal overflow", async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 540, height: 900 })
  await mount("boc-jira--long-ticket", { globals: { direction: "rtl", locale: "ar", theme: "light" } })
  await page.getByRole("button", { name: "Workspace", exact: true }).click()
  await expect(page.getByRole("button", { name: "Work on this ticket", exact: true })).toBeInViewport()
  expect(
    await page.locator(".jira-ticket-layout").evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("narrow-workspace.png") })
})

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
  await expect(page.getByRole("dialog").getByRole("status", { includeHidden: true })).toBeEmpty()
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
  await expect(page.locator(".jira-ticket-topic")).toContainText("SHOP-618")
})

story("PR states and external navigation remain usable in narrow RTL", async ({ mount, page }) => {
  await page.setViewportSize({ width: 540, height: 900 })
  await mount("boc-jira--narrow-rtl")
  const inspector = page.getByRole("dialog")
  const prs = inspector.getByRole("region", { name: "Pull requests", exact: true })
  for (const state of ["Open", "Draft", "Merged", "Closed"])
    await expect(prs.getByLabel(state, { exact: true })).toBeVisible()
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
      await expect(
        page.getByRole("dialog", { name: "Change assignee" }).getByRole("status", { includeHidden: true }),
      ).toBeEmpty()
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
