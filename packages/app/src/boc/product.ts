import { createBocTranslator } from "@boc/extensions/renderer"

export const bocProduct = import.meta.env.VITE_BOC_PRODUCT

export function bocProductPresentation(locale: () => string) {
  if (!bocProduct) return undefined
  const t = createBocTranslator(locale)
  return { label: () => t("boc.title"), icon: "./boc/favicon.png" }
}
