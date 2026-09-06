const openCodeNotificationIcon = "https://opencode.ai/favicon-96x96-v3.png"

export function notificationIcon() {
  const channel = import.meta.env.VITE_OPENCODE_CHANNEL
  if (channel !== "boc" && channel !== "local") return openCodeNotificationIcon
  return new URL("./boc/favicon.png", document.baseURI).href
}
