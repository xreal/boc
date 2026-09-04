import { expect, test } from "bun:test"
import { createBocTranslator } from "./i18n"

test("falls back to the BOC English dictionary", () => {
  const t = createBocTranslator(() => "de")

  expect(t("boc.jira.placeholder.title")).toBe("Jira board")
  expect(t("boc.jira.board.filters.active", { count: 2 })).toBe("Filters · 2")
  expect(t("boc.extension.desktopRequired.title")).toBe("Desktop app required")
})
