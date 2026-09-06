import type { Platform } from "@opencode-ai/app/desktop"
import type { ElectronAPI } from "../api-types"
import { notificationIcon } from "../../boc/branding"

export function createDesktopNotify(api: ElectronAPI): Platform["notify"] {
  return async (title, description, onClick) => {
    const focused = await api.getWindowFocused().catch(() => document.hasFocus())
    if (focused) return

    const notification = new Notification(title, {
      body: description ?? "",
      icon: notificationIcon(),
    })
    notification.onclick = () => {
      void api.showWindow()
      void api.setWindowFocus()
      onClick?.()
      notification.close()
    }
  }
}
