import { resolveTemplate } from "@solid-primitives/i18n"
import { deploymentsEnglish } from "./en"

// Boc currently ships one shared English bundle for renderer and native surfaces.
export function nativeT(key: keyof typeof deploymentsEnglish, params: Record<string, string> = {}) {
  return resolveTemplate(deploymentsEnglish[key], params)
}
