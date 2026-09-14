import { createBocControls } from "./controls"
import { createBocSessions } from "./session-links"
import { useLocation, useNavigate } from "@solidjs/router"
import type { BocHost } from "@boc/extensions/renderer"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useCurrentRoute } from "@/shell/state/layout"
import { createBocTerminal } from "./terminal"

export function createBocHost(): BocHost {
  const navigate = useNavigate()
  const location = useLocation()
  const route = useCurrentRoute()
  const platform = usePlatform()
  const language = useLanguage()

  const sessions = createBocSessions()

  return {
    sessions,
    terminal: createBocTerminal(),
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
    windowTopInset: () => {
      if (platform.platform !== "desktop" || platform.windowFullscreen?.()) return 0
      const zoom = platform.webviewZoom?.() ?? 1
      if (platform.os === "macos") return 36 / zoom
      if (platform.os === "windows") return 44 / Math.min(zoom, 1)
      return 0
    },
  }
}
