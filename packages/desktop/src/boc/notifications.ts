import type { Platform } from "@opencode-ai/app/desktop"
import type { ElectronAPI } from "../renderer/api-types"
import { notificationIcon } from "./branding"

export function bocNotifications(api: ElectronAPI): Pick<Platform, "notify"> {
  return {
    notify: async (title, description, onClick) => {
      const focused = await api.getWindowFocused().catch(() => document.hasFocus())
      if (focused) return

      const notification = new Notification(title, { body: description ?? "", icon: notificationIcon() })
      notification.onclick = () => {
        void api.showWindow()
        void api.setWindowFocus()
        onClick?.()
        notification.close()
      }
    },
  }
}
