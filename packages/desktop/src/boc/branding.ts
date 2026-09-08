const openCodeNotificationIcon = "https://opencode.ai/favicon-96x96-v3.png"

export function notificationIcon() {
  if (!import.meta.env.VITE_BOC_PRODUCT) return openCodeNotificationIcon
  return new URL("./boc/favicon.png", document.baseURI).href
}
