import { expect, story } from "../../storybook/playwright/story"

story("shows Project setup and focuses search with Ctrl/Cmd+F", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  for (const [name, origin] of [
    ["OpenCode guide", "System"],
    ["Global review", "Global"],
    ["Review changes", "Project"],
  ]) {
    const heading = component.getByRole("heading", { name, exact: true })
    await expect(heading.getByRole("img", { name: new RegExp(`^${origin} ·`) })).toBeVisible()
  }
  await expect(
    component.locator("article").filter({ hasText: "General" }).getByRole("button", { name: "Override for project" }),
  ).toBeVisible()
  await expect(
    component.locator("article").filter({ hasText: "Reviewer" }).getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible()
  const search = component.getByRole("textbox", { name: "Search capabilities" })
  await page.keyboard.press("Control+f")
  await expect(search).toBeFocused()
  await search.fill("review")
  await component.getByRole("heading", { name: "Project setup", exact: true }).click()
  await page.keyboard.press("Meta+f")
  await expect(search).toBeFocused()
  await page.keyboard.type("OpenCode guide")
  await expect(search).toHaveValue("OpenCode guide")
  await expect(component.getByRole("heading", { name: "Review changes", exact: true })).toHaveCount(0)
  const input = component.locator('[data-component="text-input-v2"]')
  await expect(input).toHaveCSS("outline-width", "1px")
  await expect(input).toHaveCSS("outline-offset", "0px")
})

story("collapses system tools until they are searched", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  const search = component.getByRole("textbox", { name: "Search capabilities" })

  await expect(component.getByRole("heading", { name: "Deploy preview", exact: true })).toBeVisible()
  await expect(component.getByRole("heading", { name: "Read", exact: true })).toHaveCount(0)
  const systemTools = component.getByText("System tools", { exact: true })
  const disclosure = systemTools.locator("../..")
  await expect(systemTools).toBeVisible()
  await expect(disclosure.locator(".controls-system-count")).toHaveText("1")
  await expect(
    disclosure.getByText("Built into OpenCode and available to agents by default.", { exact: true }),
  ).toBeVisible()
  await disclosure.click()
  await expect(component.getByRole("heading", { name: "Read", exact: true })).toBeVisible()
  await disclosure.click()
  await expect(component.getByRole("heading", { name: "Read", exact: true })).toHaveCount(0)

  await search.fill("Read")
  await expect(component.getByRole("heading", { name: "Read", exact: true })).toBeVisible()
  await expect(component.getByText("System tools", { exact: true })).toBeVisible()
  await expect(component.getByRole("img", { name: "System · bundled with OpenCode" })).toBeVisible()

  await search.fill("Deploy preview")
  await expect(component.getByRole("heading", { name: "Deploy preview", exact: true })).toBeVisible()
  await expect(component.getByRole("heading", { name: "Read", exact: true })).toHaveCount(0)
})

story("switches projects through the shared Select without page errors", async ({ mount, page }) => {
  const errors: Error[] = []
  page.on("pageerror", (error) => errors.push(error))
  const component = await mount("boc-controls--default")
  const project = component.locator('[data-component="select-v2"][aria-label="Project"]')
  await project.click()
  await page.getByText("Archive", { exact: true }).click()
  await expect(project).toContainText("Archive")
  expect(errors).toEqual([])
})

story("separates global capability controls from project controls", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  const scope = component.getByRole("group", { name: "Activation scope" })
  await scope.getByRole("button", { name: "Global", exact: true }).click()

  await expect(component.getByText("Applies to all projects", { exact: true })).toBeVisible()
  await expect(component.getByRole("group", { name: "Project" })).toHaveCount(0)
  await expect(component.getByRole("button", { name: /^Tools / })).toHaveCount(0)
  await expect(component.getByRole("heading", { name: "Global review", exact: true })).toBeVisible()
  await expect(component.getByRole("heading", { name: "Review changes", exact: true })).toHaveCount(0)
  await component.getByRole("button", { name: "Config file", exact: true }).click()
  const config = page.getByRole("dialog")
  await expect(config.getByRole("heading", { name: "Global config file", exact: true })).toBeVisible()
  await expect(config.getByText("File: /config/opencode/opencode.json", { exact: true })).toBeVisible()
  await expect(config.getByText("Save in", { exact: true })).toHaveCount(0)
  const panel = await page.locator(".controls-editor-container").boundingBox()
  const viewport = page.viewportSize()
  if (!panel || !viewport) throw new Error("Expected a centered config dialog")
  expect(Math.abs(panel.x + panel.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1)
  await config.getByRole("button", { name: "Close", exact: true }).click()

  await component.getByRole("switch", { name: "Global review" }).focus()
  await page.keyboard.press("Space")
  await scope.getByRole("button", { name: "Project", exact: true }).click()
  const skill = component.getByRole("switch", { name: "Global review" })
  await expect(skill).toBeDisabled()
  await expect(skill).not.toBeChecked()
  await expect(
    component.getByText("Disabled globally. Change this setting in the Global tab.", { exact: true }),
  ).toBeVisible()
})

story(
  "applies inline native agent and skill switches with the keyboard and preserves focus",
  async ({ mount, page }) => {
    const component = await mount("boc-controls--default")
    await expect(component.getByText("Enabled here", { exact: true })).toHaveCount(0)
    const agent = component.getByRole("switch", { name: "Reviewer" })
    await agent.focus()
    await page.keyboard.press("Space")
    await expect(agent).toBeFocused()
    await expect(agent).not.toBeChecked()
    const toggle = component.getByRole("switch", { name: "Review changes" })
    await toggle.focus()
    await page.keyboard.press("Space")
    await expect(toggle).toBeFocused()
    await expect(toggle).not.toBeChecked()
    await expect(component.getByText("Disabled here", { exact: true })).toHaveCount(0)
    await component.getByRole("button", { name: "Instructions 1", exact: true }).click()
    await expect(component.getByRole("heading", { name: "AGENTS.md", exact: true })).toBeVisible()
    await expect(component.getByRole("switch", { name: "AGENTS.md", exact: true })).toBeChecked()
    await component.getByRole("textbox", { name: "Search capabilities" }).fill("no matching capability")
    await expect(component.getByText("No capabilities match your search.")).toBeVisible()
    await component.getByRole("button", { name: "Clear filters" }).click()
    await expect(toggle).toBeVisible()
  },
)

story("edits native agent and MCP configuration", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  await component
    .locator("article")
    .filter({ hasText: "Reviewer" })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Edit Reviewer", exact: true })).toBeVisible()
  await expect(dialog.getByRole("group", { name: "Type" })).toHaveCount(0)
  await expect(dialog.getByLabel("Agent or server ID")).toHaveCount(0)
  await dialog.getByRole("group", { name: "Activation in this file" }).getByRole("button", { name: "Disabled" }).click()
  await dialog.getByRole("group", { name: "Activation in this file" }).getByRole("button", { name: "Enabled" }).click()
  await dialog.getByRole("button", { name: "Model" }).click()
  const search = page.getByPlaceholder("Search models and providers")
  const list = page.locator('.controls-model-menu [data-slot="list-scroll"]')
  await expect(list).toHaveJSProperty("scrollTop", 0)
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  const searchBox = await search.boundingBox()
  const listBox = await list.boundingBox()
  if (!listBox) throw new Error("Expected model list scroll container")
  await page.mouse.move(listBox.x + 24, listBox.y + listBox.height - 24)
  await page.mouse.wheel(0, 320)
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const scrolledSearchBox = await search.boundingBox()
  expect(Math.abs((scrolledSearchBox?.y ?? 0) - (searchBox?.y ?? 0))).toBeLessThanOrEqual(1)
  expect(
    await page
      .locator(".controls-model-option")
      .evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth)),
  ).toBe(true)
  await search.fill("claude sonnet")
  await page.getByText("Claude Sonnet 4.6", { exact: true }).click()
  await dialog.getByRole("group", { name: "Variant" }).getByRole("button", { name: "fast" }).click()
  await dialog.getByRole("button", { name: "JSONC", exact: true }).click()
  await expect(dialog.getByLabel("Definition · JSONC")).toHaveValue(/"model": "anthropic\/claude-sonnet-4-6#fast"/)
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await expect(dialog.getByText("Saved. OpenCode reloads configuration automatically.")).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await component.getByRole("button", { name: "Add agent", exact: true }).click()
  const addAgent = page.getByRole("dialog")
  await expect(addAgent.getByRole("heading", { name: "Add agent", exact: true })).toBeVisible()
  await expect(addAgent.getByRole("group", { name: "Type" })).toHaveCount(0)
  await expect(addAgent.getByRole("button", { name: "JSONC", exact: true })).toHaveCount(0)
  const agentID = addAgent.getByLabel("Agent or server ID")
  await agentID.fill("release-notes")
  await expect(agentID).toHaveValue("release-notes")
  await expect(addAgent.getByLabel("Description")).toBeVisible()
  await expect(addAgent.getByRole("button", { name: "Create definition" })).toHaveCount(0)
  await addAgent.getByRole("button", { name: "Save changes" }).click()
  await addAgent.getByRole("button", { name: "Close", exact: true }).click()
  await component.getByRole("button", { name: "Add MCP server", exact: true }).click()
  const addMcp = page.getByRole("dialog")
  await addMcp.getByLabel("Agent or server ID").fill("native-docs")
  await addMcp.getByLabel("Server URL").fill("https://native.example.com/mcp")
  await addMcp.getByRole("button", { name: "Save changes" }).click()
  await expect(addMcp.getByText("Saved. OpenCode reloads configuration automatically.")).toBeVisible()
  await addMcp.getByRole("button", { name: "Close", exact: true }).click()
  await component
    .locator("article")
    .filter({ hasText: "Documentation" })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const mcp = page.getByRole("dialog")
  await mcp.getByLabel("Server URL").fill("https://docs.example.com/updated-mcp")
  await mcp.getByRole("button", { name: "JSONC", exact: true }).click()
  await expect(mcp.getByLabel("Definition · JSONC")).toHaveValue(/"X-Api-Key": "fixture-key"/)
  await expect(mcp.getByLabel("Definition · JSONC")).toHaveValue(/"client_id": "fixture-client"/)
})

story("retains a configuration draft when the file conflicts", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  await component.getByRole("button", { name: "Config file", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Project config file", exact: true })).toBeVisible()
  await expect(dialog.getByText("File: /workspace/shop/opencode.json", { exact: true })).toBeVisible()
  await expect(dialog.getByRole("button", { name: "Common settings", exact: true })).toBeVisible()
  await expect(dialog.getByText("Save in", { exact: true })).toHaveCount(0)
  const content = dialog.getByLabel("Configuration content")
  await content.fill('{ "fixture-conflict": true }')
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await expect(
    dialog.getByText(
      "The file changed outside this editor. Your draft is kept. Reopen the editor to load the latest version before saving.",
    ),
  ).toBeVisible()
  await expect(content).toHaveValue('{ "fixture-conflict": true }')
})

story("edits and creates native Markdown sources", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  await component
    .locator("article")
    .filter({ hasText: "Review changes" })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const editor = page.getByRole("dialog")
  const markdown = editor.getByLabel("Instructions · Markdown")
  await markdown.fill("---\nname: review\ndescription: Review changes\n---\n\nReview the staged diff.\n")
  await editor.getByRole("button", { name: "Save changes" }).click()
  await expect(editor.getByText("File saved. Future instruction and skill loads use the updated source.")).toBeVisible()
  await expect(editor.locator(".controls-editor-success")).toBeVisible()
  await editor.getByRole("button", { name: "Remove file…", exact: true }).click()
  await expect(editor.getByRole("button", { name: "Delete file", exact: true })).toHaveAttribute(
    "data-variant",
    "danger",
  )
  await expect(editor.getByText("File saved. Future instruction and skill loads use the updated source.")).toHaveCount(
    0,
  )
  await expect(editor.locator(".controls-editor-danger")).toBeVisible()
  await editor.getByRole("button", { name: "Keep file", exact: true }).click()
  await editor.getByRole("button", { name: "Close", exact: true }).click()
  await component.getByRole("button", { name: "Add skill", exact: true }).click()
  const configuration = page.getByRole("dialog")
  await expect(configuration.getByRole("group", { name: "Type" })).toHaveCount(0)
  await configuration.getByRole("button", { name: "Create skill", exact: true }).click()
  const source = page.getByRole("dialog")
  await source.getByLabel("Skill name · lowercase letters, numbers and hyphens").fill("release-notes")
  await source.getByLabel("Description").fill("Writes release notes")
  await source.getByLabel("Instructions · Markdown").fill("Write concise release notes.\n")
  await source.getByRole("button", { name: "Save changes" }).click()
  await expect(source.getByText("File saved. Future instruction and skill loads use the updated source.")).toBeVisible()
})

story("edits an existing project AGENTS.md and permits a global one", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  await component.getByRole("button", { name: "Add instructions", exact: true }).click()
  const configuration = page.getByRole("dialog")
  await expect(configuration.getByRole("button", { name: "Edit AGENTS.md", exact: true })).toBeEnabled()
  await expect(configuration.getByRole("button", { name: "Create AGENTS.md", exact: true })).toHaveCount(0)
  await configuration.getByRole("button", { name: "Edit AGENTS.md", exact: true }).click()
  const source = page.getByRole("dialog")
  await expect(source.getByLabel("Instructions · Markdown")).toHaveValue(/Project instructions/)
  await source.getByRole("button", { name: "Close", exact: true }).click()
  await component
    .getByRole("group", { name: "Activation scope" })
    .getByRole("button", { name: "Global", exact: true })
    .click()
  await component.getByRole("button", { name: "Add instructions", exact: true }).click()
  const global = page.getByRole("dialog")
  await expect(global.getByRole("button", { name: "Create AGENTS.md", exact: true })).toBeEnabled()
  await expect(global.getByRole("button", { name: "Edit AGENTS.md", exact: true })).toHaveCount(0)
})

story("keeps a draft after closing a definition selected from the dropdown", async ({ mount, page }) => {
  const component = await mount("boc-controls--default")
  await component.getByRole("button", { name: "Config file", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Common settings", exact: true }).click()
  const definition = dialog.locator('[data-component="select-v2"][aria-label="Definition"]')
  await definition.click()
  await page.getByText("planner", { exact: true }).click()
  await expect(definition).toContainText("planner")
  await dialog.getByLabel("Agent or server ID").fill("draft-agent")
  await dialog.getByRole("button", { name: "Create definition" }).click()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await expect(dialog.getByText("You have unsaved changes.")).toBeVisible()
  await expect(definition).toContainText("draft-agent")
})

story("keeps the project selector usable without overflow in narrow RTL", async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 850 })
  const component = await mount("boc-controls--rtl")
  await expect(component.getByRole("heading", { name: "Project setup", exact: true })).toHaveCSS("direction", "rtl")
  await expect(component.getByLabel("Server", { exact: true })).toHaveCount(0)
  await expect(component.getByRole("group", { name: "Project" })).toBeVisible()
  await expect(component.getByRole("group", { name: "Worktree" })).toHaveCount(0)
  await expect(component.getByRole("combobox", { name: "Project" })).toHaveCount(0)
  await component
    .locator("article")
    .filter({ hasText: "Reviewer" })
    .getByRole("button", { name: "Edit", exact: true })
    .click()
  const dialog = page.getByRole("dialog")
  for (const name of ["Type", "Agent mode"]) {
    const buttons = dialog.getByRole("group", { name }).getByRole("button")
    expect(
      await buttons.evaluateAll((items) =>
        items.every((item) => item.scrollWidth <= item.clientWidth && item.scrollHeight <= item.clientHeight),
      ),
    ).toBe(true)
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await component.getByRole("textbox", { name: "Search capabilities" }).fill("review")
  await expect(component.getByRole("heading", { name: "Review changes", exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  )
})
