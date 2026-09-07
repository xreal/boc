import { describe, expect, test } from "bun:test"
import { autoSyncOffMenuVisible, redeployMenuVisible } from "./action-visibility"

describe("redeploy menu visibility", () => {
  test("shows only for a known non-master branch", () => {
    expect(redeployMenuVisible({ branch: "SHOP-42" })).toBe(true)
    expect(redeployMenuVisible({ branch: " master " })).toBe(false)
    expect(redeployMenuVisible({})).toBe(false)
  })
})

describe("auto-sync menu visibility", () => {
  test("only offers the safe off operation", () => {
    expect(autoSyncOffMenuVisible({ autoSync: "on" })).toBe(true)
    expect(autoSyncOffMenuVisible({ autoSync: "no-prune" })).toBe(true)
    expect(autoSyncOffMenuVisible({ autoSync: "off" })).toBe(false)
  })
})
