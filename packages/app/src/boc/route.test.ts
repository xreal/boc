import { describe, expect, test } from "bun:test"
import { currentRoute } from "@/shell/state/layout"
import { parseSettingsView, settingsViewUrl } from "@/settings/route"

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

  test("restores Boc settings from a shared URL", () => {
    const root = settingsViewUrl({ type: "root", tab: "boc" })
    const server = settingsViewUrl({ type: "server", server: "ssh:staging", tab: "boc" })

    expect(parseSettingsView(new URL(root, "http://localhost").search, false).tab).toBe("boc")
    expect(parseSettingsView(new URL(server, "http://localhost").search, true)).toMatchObject({
      type: "server",
      server: "ssh:staging",
      tab: "boc",
    })
  })
})
