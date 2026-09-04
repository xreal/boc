import { expect, test } from "bun:test"

test("deployment table progressively hides lower-priority columns before scrolling", async () => {
  const css = await Bun.file(new URL("./deployments.css", import.meta.url)).text()

  expect(css).toContain("max-width: 77.99rem")
  expect(css).toContain('[data-deployment-column="auto-sync"]')
  expect(css).toContain("max-width: 67.99rem")
  expect(css).toContain('[data-deployment-column="age"]')
  expect(css).toContain("max-width: 55.99rem")
  expect(css).toContain('[data-deployment-column="sync"]')
  expect(css).toContain('[data-deployment-column="health"]')
  expect(css).toContain("max-width: 43.99rem")
  expect(css).toContain('[data-deployment-column="ticket"]')
  expect(css).toContain("min-width: 40rem")
})
