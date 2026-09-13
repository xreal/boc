import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { pluralCategory, type UiPluralCategory } from "@opencode/ui/context/i18n"
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
  "boc.terminal.sessionRequired": "Open a local session before starting a terminal command.",
  "boc.terminal.starting": "Starting SSH session…",
  "boc.terminal.ended": "SSH session ended.",
  "boc.terminal.connectFailed": "SSH could not connect. Check your network or VPN connection and SSH access.",
  ...controlsEnglish,
  ...deploymentsEnglish,
  ...jiraEnglish,
  ...environmentsEnglish,
} as const

type BocEnglishKey = keyof typeof bocEnglish
type PluralBase<Key> = Key extends `${infer Base}.other` ? (`${Base}.one` extends BocEnglishKey ? Base : never) : never
export type BocPluralKey = PluralBase<BocEnglishKey>
export type BocI18nKey = Exclude<BocEnglishKey, `${BocPluralKey}.${UiPluralCategory}`>
type BocParams = Record<string, string | number | boolean>
export type BocTranslator = {
  (key: BocI18nKey, params?: BocParams): string
  plural: (key: BocPluralKey, count: number, params?: BocParams) => string
}

export function createBocTranslator(locale: () => string) {
  const translate = translator(() => {
    locale()
    return bocEnglish
  }, resolveTemplate)
  return Object.assign(translate, {
    plural: (key: BocPluralKey, count: number, params?: BocParams) => {
      locale()
      // Boc currently has English source copy only: fallback grammar follows the source locale.
      const category = pluralCategory("en", count)
      const values: Partial<Record<string, string>> = bocEnglish
      return resolveTemplate(values[`${key}.${category}`] ?? values[`${key}.other`] ?? key, { ...params, count })
    },
  }) as BocTranslator
}
