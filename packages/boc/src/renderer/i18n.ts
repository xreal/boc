import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { controlsEnglish } from "../tools/controls/i18n/en"
import { deploymentsEnglish } from "../tools/deployments/i18n/en"
import { jiraEnglish } from "../tools/jira/i18n/en"
import { environmentsEnglish } from "../environments/i18n/en"

export const bocEnglish = {
  "boc.title": "Boc",
  "boc.settings.title": "Boc",
  "boc.settings.description": "Configure Boc development environment behavior.",
  "boc.settings.project": "Project",
  "boc.settings.project.description": "Choose a server and project to configure its environment behavior.",
  "boc.settings.project.select": "Select a project",
  "boc.settings.project.empty": "No project is selected.",
  "boc.projectTabs.reorder": "Drag to reorder projects, or use Alt+Arrow Up/Down. Click to collapse or expand.",
  "boc.projectTabs.newSession": "Create session in {{project}}",
  "boc.opened.description": "Boc fork extension point. This button and command are owned by the boc fork.",
  "boc.extension.loading": "Loading extension…",
  "boc.extension.notFound.title": "Extension not found",
  "boc.extension.notFound.description": "This Boc extension is not registered.",
  "boc.extension.desktopRequired.title": "Desktop app required",
  "boc.extension.desktopRequired.description": "This Boc extension is available in the desktop app.",
  ...controlsEnglish,
  ...deploymentsEnglish,
  ...jiraEnglish,
  ...environmentsEnglish,
} as const

export type BocI18nKey = keyof typeof bocEnglish
export type BocTranslator = (key: BocI18nKey, params?: Record<string, string | number | boolean>) => string

export function createBocTranslator(locale: () => string) {
  return translator(() => {
    locale()
    return bocEnglish
  }, resolveTemplate) as BocTranslator
}
