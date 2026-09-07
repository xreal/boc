import { createBocControls } from "./controls"
import { createBocSessions } from "./session-links"
import { useLocation, useNavigate } from "@solidjs/router"
import type { BocHost } from "@boc/extensions/renderer"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCurrentRoute } from "@/shell/state/layout"

export function createBocHost(): BocHost {
  const navigate = useNavigate()
  const location = useLocation()
  const route = useCurrentRoute()
  const platform = usePlatform()
  const language = useLanguage()

  const sessions = createBocSessions()

  return {
    sessions,
    controls: createBocControls(),
    navigate,
    location: () => ({ pathname: location.pathname, search: location.search }),
    route: () => {
      const current = route()
      if (current.type === "boc") return current
      return { type: current.type }
    },
    openExternal: platform.openExternal,
    locale: language.locale,
    platform: platform.platform,
  }
}
