import { expect, story } from "../../storybook/playwright/story"

story("selects a branch with the keyboard and closes its popup", async ({ mount, page }) => {
  await mount("boc-deployments--default")
  const dialog = page.getByRole("dialog")
  const branch = dialog.getByRole("combobox", { name: "Branch" })

  await expect(branch).toHaveValue("SHOP-617")
  await branch.fill("SHOP-617")
  const popup = page.locator(".deployment-branch-menu")
  await expect(popup).toBeVisible()
  await expect(popup.getByText("SHOP-617-product-gallery", { exact: true })).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")
  await expect(popup).not.toBeVisible()
  await expect(branch).toHaveValue("SHOP-617-product-gallery")
  await expect(dialog.getByRole("button", { name: "Deploy to dev-01" })).toBeEnabled()
  await dialog.locator(".deployment-branch-trigger").click()
  await expect(popup).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(popup).not.toBeVisible()
  await expect(dialog).toBeVisible()
})

story("keeps compact workflows and per-workflow options", async ({ mount, page }) => {
  await mount("boc-deployments--default")
  const dialog = page.getByRole("dialog")
  const branch = dialog.getByRole("combobox", { name: "Branch" })
  await branch.fill("SHOP-617")
  await expect(
    page.locator(".deployment-branch-menu").getByText("SHOP-617-product-gallery", { exact: true }),
  ).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("Enter")

  const workflows = dialog.getByRole("group", { name: "Workflows" })
  const choices = workflows.getByRole("checkbox")
  await expect(choices.first()).toBeChecked()
  expect(await choices.count()).toBeGreaterThan(1)
  expect(await dialog.locator(".deployment-workflow-choices").evaluate((element) => element.scrollHeight <= 96)).toBe(
    true,
  )
  await workflows.getByText("Admin", { exact: true }).click()
  await expect(choices.nth(1)).toBeChecked()

  const options = dialog.getByText("Options", { exact: true })
  await options.click()
  const selectedWorkflowControl = dialog
    .getByRole("group", { name: "Admin" })
    .getByRole("group", { name: "Perform tests" })
  const selectedWorkflowOption = selectedWorkflowControl.getByRole("switch")
  await expect(selectedWorkflowControl).toBeVisible()
  await selectedWorkflowControl.click()
  const changed = await selectedWorkflowOption.isChecked()
  await workflows.getByText("Admin", { exact: true }).click()
  await expect(choices.nth(1)).not.toBeChecked()
  await workflows.getByText("Admin", { exact: true }).click()
  await expect(selectedWorkflowOption).toBeChecked({ checked: changed })
})

story("retries a failed preparation without dispatching", async ({ mount, page }) => {
  await mount("boc-deployments--retry")
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("alert")).toBeVisible()
  const deploy = dialog.getByRole("button", { name: "Deploy to dev-01" })
  await expect(deploy).toBeDisabled()
  await dialog.getByRole("button", { name: "Check again" }).click()
  await expect(deploy).toBeEnabled()
})

story("shows slow preparation and an expired prepared plan", async ({ mount, page }) => {
  await mount("boc-deployments--slow-preparation")
  const slow = page.getByRole("dialog")
  await expect(slow.getByRole("button", { name: "Checking…" })).toBeDisabled()
  await expect(slow.getByRole("button", { name: "Deploy to dev-01" })).toBeEnabled()

  await mount("boc-deployments--expired")
  const expired = page.getByRole("dialog")
  await expect(expired.getByText("Check this deployment again to continue.", { exact: true })).toBeVisible()
  await expect(expired.getByRole("button", { name: "Check again" })).toBeVisible()
  await expect(expired.getByRole("button", { name: "Deploy to dev-01" })).toBeDisabled()
})

story("renders reset as a readonly summary", async ({ mount, page }) => {
  await mount("boc-deployments--reset")
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Reset dev-01" })).toBeVisible()
  await expect(dialog.getByText("master", { exact: true })).toBeVisible()
  await expect(
    dialog.getByText("Deploy master with tests enabled, without a forced rebuild or regression tests."),
  ).toBeVisible()
  await expect(dialog.getByRole("combobox", { name: "Branch" })).toHaveCount(0)
  await expect(dialog.getByRole("checkbox")).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "Reset dev-01" })).toBeEnabled()
})

story("fits the deployment preflight in narrow forced RTL", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await mount("boc-deployments--narrow-rtl", {
    globals: { direction: "rtl", locale: "en", theme: "dark" },
  })
  const dialog = page.getByRole("dialog")
  await expect(dialog).toHaveCSS("direction", "rtl")
  await expect(dialog.getByRole("button", { name: "Close deployment dialog" })).toBeInViewport()
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  const control = await dialog.locator(".deployment-branch-control").boundingBox()
  const trigger = await dialog.locator(".deployment-branch-trigger").boundingBox()
  if (!control || !trigger) throw new Error("Expected branch picker controls")
  expect(trigger.x).toBeGreaterThanOrEqual(control.x)
  expect(trigger.x + trigger.width).toBeLessThanOrEqual(control.x + control.width)
  const branch = dialog.getByRole("combobox", { name: "Branch" })
  await expect(branch).toHaveCSS("direction", "ltr")
  await branch.fill("SHOP-61")
  await expect(page.locator(".deployment-branch-menu")).toBeInViewport()
})
