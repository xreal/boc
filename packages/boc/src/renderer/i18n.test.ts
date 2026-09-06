import { expect, test } from "bun:test"
import { createBocTranslator } from "./i18n"

test("falls back to the BOC English dictionary", () => {
  const t = createBocTranslator(() => "de")

  expect(t("boc.jira.placeholder.title")).toBe("Jira board")
  expect(t("boc.deployments.screen.title")).toBe("Dev systems")
  expect(t("boc.jira.board.issueCount.filtered", { count: 2, total: 9 })).toBe("2 of 9 issues")
  expect(t("boc.extension.desktopRequired.title")).toBe("Desktop app required")
  expect(t("boc.environments.settings.shared.title")).toBe("Shared local services")
})
