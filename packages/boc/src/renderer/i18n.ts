import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { jiraEnglish } from "../tools/jira/i18n/en"

export const bocEnglish = {
  "boc.title": "Boc",
  "boc.opened.description": "Boc fork extension point. This button and command are owned by the boc fork.",
  "boc.extension.loading": "Loading extension…",
  "boc.extension.notFound.title": "Extension not found",
  "boc.extension.notFound.description": "This Boc extension is not registered.",
  "boc.extension.desktopRequired.title": "Desktop app required",
  "boc.extension.desktopRequired.description": "This Boc extension is available in the desktop app.",
  ...jiraEnglish,
} as const

export type BocI18nKey = keyof typeof bocEnglish
export type BocTranslator = (key: BocI18nKey, params?: Record<string, string | number | boolean>) => string

export function createBocTranslator(locale: () => string) {
  return translator(() => {
    locale()
    return bocEnglish
  }, resolveTemplate) as BocTranslator
}
