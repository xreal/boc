import { expect, test } from "bun:test"
import { deploymentSiteUrl } from "./site-url"

test("uses the regular dev URL unless both credentials are filled", () => {
  expect(deploymentSiteUrl("01")).toBe("https://dev-01.bergfreunde.de")
  expect(deploymentSiteUrl("02", { siteUsername: "demo", sitePassword: "" })).toBe("https://dev-02.bergfreunde.de")
  expect(deploymentSiteUrl("epm", { siteUsername: "", sitePassword: "demo" })).toBe("https://dev-epm.bergfreunde.de")
})

test("encodes credentials without changing the destination host", () => {
  const credentials = { siteUsername: "demo@role:qa", sitePassword: "p@ss:/?# %ü" }
  const url = new URL(deploymentSiteUrl("01", credentials))
  expect(url.origin).toBe("https://dev-01.bergfreunde.de")
  expect(url.pathname).toBe("/")
  expect(url.search).toBe("")
  expect(url.hash).toBe("")
  expect(decodeURIComponent(url.username)).toBe(credentials.siteUsername)
  expect(decodeURIComponent(url.password)).toBe(credentials.sitePassword)
})
