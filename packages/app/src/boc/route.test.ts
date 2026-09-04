import { describe, expect, test } from "bun:test"
import { currentRoute } from "@/shell/state/layout"

describe("BOC routes", () => {
  test("parses a registered extension route", () => {
    expect(currentRoute("/boc/jira", "")).toEqual({ type: "boc", id: "jira" })
  })

  test("parses an unknown extension route for the BOC not-found screen", () => {
    expect(currentRoute("/boc/unknown", "")).toEqual({ type: "boc", id: "unknown" })
  })

  test("parses the BOC root with an empty extension id", () => {
    expect(currentRoute("/boc", "")).toEqual({ type: "boc", id: "" })
  })
})
