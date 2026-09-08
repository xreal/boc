import { stat } from "node:fs/promises"
import path from "node:path"
import type { Configuration } from "electron-builder"
import upstream from "../../../desktop/electron-builder.config"
import { bocResources, packagingRift } from "./paths"

const appId = "ai.boc.desktop.beta"

export function bocBuilderConfig(
  base: Configuration = upstream as Configuration,
  options = {
    rift: packagingRift()?.file,
    windowsSigning: process.env.OPENCODE_WINDOWS_SIGNING !== "false",
    publisher: process.env.WINDOWS_PUBLISHER_NAME,
  },
): Configuration {
  const metainfo = `${path.join(bocResources, `${appId}.metainfo.xml`)}=/usr/share/metainfo/${appId}.metainfo.xml`
  return {
    ...base,
    appId,
    productName: "Boc Beta",
    artifactName: "boc-desktop-${version}-${os}-${arch}.${ext}",
    protocols: { name: "Boc Beta", schemes: ["opencode"] },
    publish: { provider: "generic", url: "https://boc-updates.bergdev.de", channel: "latest" },
    extraMetadata: { ...base.extraMetadata, desktopName: `${appId}.desktop` },
    files: [...[base.files ?? []].flat(), "!resources/rift{,/**/*}", "!resources/linux/opencode-desktop.desktop"],
    extraResources: [
      ...[base.extraResources ?? []].flat(),
      ...(options.rift ? [{ from: options.rift, to: "rift/rift" }] : []),
    ],
    afterPack: async (context) => {
      if (typeof base.afterPack !== "function") throw new Error("Expected upstream afterPack validation function")
      await base.afterPack(context)
      if (!options.rift) return
      const rift = path.join(context.packager.getResourcesDir(context.appOutDir), "rift", "rift")
      const file = await stat(rift)
      if (!file.isFile() || file.size === 0) throw new Error(`Bundled Rift must be a non-empty file: ${rift}`)
    },
    win: {
      ...base.win,
      signtoolOptions: options.windowsSigning
        ? { ...base.win?.signtoolOptions, publisherName: options.publisher }
        : { sign: async () => {} },
      verifyUpdateCodeSignature: options.windowsSigning,
    },
    linux: {
      ...base.linux,
      executableName: appId,
      desktop: {
        ...base.linux?.desktop,
        entry: { ...base.linux?.desktop?.entry, StartupWMClass: appId },
      },
    },
    deb: { ...base.deb, fpm: [metainfo] },
    rpm: { ...base.rpm, packageName: "boc-beta", fpm: [metainfo] },
  }
}

export default bocBuilderConfig()
