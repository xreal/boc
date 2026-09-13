import { expect, test } from "bun:test"
import { matchesJiraBranch, safePullRequestUrl, sortPullRequests } from "./pull-request"
import { jiraPullRequestFixtures } from "../fixtures/issue"

test("only the complete leading issue key followed by a hyphen matches", () => {
  expect(matchesJiraBranch("shop-617-gallery", "SHOP-617")).toBe(true)
  for (const branch of [
    "SHOP-617",
    "SHOP-617_gallery",
    "SHOP-617/gallery",
    "feat/SHOP-617-gallery",
    "SHOP-6170-gallery",
    "SHOP-61-gallery",
  ]) {
    expect(matchesJiraBranch(branch, "SHOP-617")).toBe(false)
  }
})

test("PR destinations stay inside the expected repository", () => {
  expect(safePullRequestUrl("https://github.com/example/shop/pull/101", "example/shop", 101)).toBe(true)
  for (const url of [
    "http://github.com/example/shop/pull/101",
    "https://github.com/other/shop/pull/101",
    "https://github.com/example/shop/pull/102",
    "https://github.com@example.invalid/example/shop/pull/101",
    "https://github.com/example/shop/pull/101#payload",
  ])
    expect(safePullRequestUrl(url, "example/shop", 101)).toBe(false)
})

test("open and draft PRs precede history with deterministic date and number ordering", () => {
  const sorted = sortPullRequests([...jiraPullRequestFixtures].reverse())
  expect(sorted.map((request) => request.number)).toEqual([102, 101, 104, 103])
})
