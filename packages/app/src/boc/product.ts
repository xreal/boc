import { createBocTranslator } from "@boc/extensions/renderer"
import "./chat-colors.css"

export const bocProduct = import.meta.env.VITE_BOC_PRODUCT

if (typeof document !== "undefined") {
  if (bocProduct) document.documentElement.dataset.bocProduct = bocProduct
  if (!bocProduct) delete document.documentElement.dataset.bocProduct
}

export function bocProductPresentation(locale: () => string) {
  if (!bocProduct) return undefined
  const t = createBocTranslator(locale)
  return { label: () => t("boc.title"), icon: "./boc/favicon.png" }
}
