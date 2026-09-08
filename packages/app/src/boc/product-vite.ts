import type { Plugin } from "vite"

export function bocProductConfig(channel: string): Plugin {
  return {
    name: "boc:product",
    enforce: "post",
    config() {
      return {
        define: {
          "import.meta.env.VITE_BOC_PRODUCT": JSON.stringify(
            channel === "boc" ? "boc" : channel === "local" ? "boc-dev" : "",
          ),
          // The upstream app plugin also defines this value; run after its config hook.
          ...(channel === "boc" ? { "import.meta.env.VITE_OPENCODE_CHANNEL": JSON.stringify("beta") } : {}),
        },
      }
    },
  }
}
