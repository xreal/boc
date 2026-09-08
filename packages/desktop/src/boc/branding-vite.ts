import { readFileSync } from "node:fs"
import type { Plugin } from "vite"

export function bocBranding(channel: string): Plugin {
  if (channel !== "boc" && channel !== "local") return { name: "boc:branding" }

  const iconSet = channel === "local" ? "boc-dev" : "boc"
  const files = [
    { name: "favicon.png", source: "android/mipmap-xhdpi/ic_launcher.png", type: "image/png" },
    { name: "favicon.svg", source: "brand.svg", type: "image/svg+xml" },
    { name: "favicon.ico", source: "icon.ico", type: "image/x-icon" },
    { name: "apple-touch-icon.png", source: "ios/AppIcon-60x60@3x.png", type: "image/png" },
    { name: "manifest-192.png", source: "android/mipmap-xxxhdpi/ic_launcher.png", type: "image/png" },
    { name: "manifest-512.png", source: "icon.png", type: "image/png" },
  ].map((file) => ({
    ...file,
    fileName: `boc/${file.name}`,
    contents: readFileSync(new URL(`../../icons/${iconSet}/${file.source}`, import.meta.url)),
  }))
  files.push({
    name: "site.webmanifest",
    source: "",
    fileName: "boc/site.webmanifest",
    type: "application/manifest+json",
    contents: Buffer.from(
      JSON.stringify({
        name: "Boc",
        short_name: "Boc",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        icons: [192, 512].map((size) => ({
          src: `/boc/manifest-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "maskable",
        })),
      }),
    ),
  })

  return {
    name: "boc:branding",
    enforce: "pre",
    generateBundle() {
      files.forEach((file) => this.emitFile({ type: "asset", fileName: file.fileName, source: file.contents }))
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const file = files.find((file) => `/${file.fileName}` === request.url?.split("?")[0])
        if (!file) return next()
        response.setHeader("Content-Type", file.type)
        response.end(file.contents)
      })
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace("<title>OpenCode</title>", "<title>Boc</title>")
          .replace("%OPENCODE_FAVICON%", "/boc/favicon.ico")
          .replace("%OPENCODE_APPLE_TOUCH_ICON%", "/boc/apple-touch-icon.png")
          .replace('href="/site.webmanifest"', 'href="/boc/site.webmanifest"')
          .replace("./favicon-96x96-v3.png", "./boc/favicon.png")
          .replace("./favicon-v3.svg", "./boc/favicon.svg")
          .replace("./favicon-v3.ico", "./boc/favicon.ico")
          .replace("./apple-touch-icon-v3.png", "./boc/apple-touch-icon.png")
      },
    },
  }
}
