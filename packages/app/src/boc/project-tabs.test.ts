import { describe, expect, test } from "bun:test"
import { reverseProjectTabGroups } from "./project-tabs"

describe("reverseProjectTabGroups", () => {
  const projects = new Map([
    ["alpha-old", "alpha"],
    ["alpha-new", "alpha"],
    ["beta-old", "beta"],
    ["beta-new", "beta"],
  ])

  test("shows newest tabs first within each project", () => {
    expect(
      reverseProjectTabGroups(
        ["alpha-old", "beta-old", "alpha-new", "beta-new"],
        (tab) => projects.get(tab)!,
        ["beta", "alpha"],
      ),
    ).toEqual(["beta-new", "beta-old", "alpha-new", "alpha-old"])
  })

  test("translates displayed tabs back to storage order", () => {
    expect(
      reverseProjectTabGroups(
        ["beta-new", "beta-old", "alpha-new", "alpha-old"],
        (tab) => projects.get(tab)!,
        ["beta", "alpha"],
      ),
    ).toEqual(["beta-old", "beta-new", "alpha-old", "alpha-new"])
  })
})
