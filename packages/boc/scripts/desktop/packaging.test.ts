import { expect, test } from "bun:test"
import path from "node:path"
import type { Configuration } from "electron-builder"
import upstream from "../../../desktop/electron-builder.config"
import { CLI_BINARIES } from "../../../desktop/scripts/utils"
import { bocBuilderConfig } from "./electron-builder.config"
import { desktopDirectory } from "./paths"
import { developmentEnvironment, developmentOptions } from "./dev"

test.each(CLI_BINARIES)("composes Boc identity and resources for $target", (target) => {
  const config = bocBuilderConfig(upstream as Configuration, { windowsSigning: false, publisher: undefined })
  expect(config.appId).toBe("ai.boc.desktop.beta")
  expect(config.extraMetadata?.desktopName).toBe("ai.boc.desktop.beta.desktop")
  expect(config.linux?.executableName).toBe(config.appId)
  expect(config.linux?.desktop?.entry?.StartupWMClass).toBe("ai.boc.desktop.beta")
  expect(config.deb?.fpm).toEqual([
    expect.stringContaining(
      "/boc/resources/ai.boc.desktop.beta.metainfo.xml=/usr/share/metainfo/ai.boc.desktop.beta.metainfo.xml",
    ),
  ])
  expect(config.rpm?.fpm).toEqual(config.deb?.fpm)
  expect(config.rpm?.packageName).toBe("boc-beta")
  expect(config.extraResources).toBe(upstream.extraResources)
  // Upstream keeps ownership of dependency trimming, native installer hooks, and macOS signing.
  expect(config.files).toEqual([
    ...[upstream.files ?? []].flat(),
    "!resources/linux/opencode-desktop.desktop",
  ])
  expect(config.mac).toBe(upstream.mac)
  expect(config.dmg).toBe(upstream.dmg)
  expect(config.nsis).toBe(upstream.nsis)
  expect(config.nsis?.include).toBe(path.join(desktopDirectory, "resources/windows/installer.nsh"))
})

test("replaces precomputed upstream release identities and legacy Linux launchers", () => {
  const base: Configuration = {
    ...(upstream as Configuration),
    deb: { fpm: ["upstream.desktop=/usr/share/applications/upstream.desktop"] },
    rpm: { packageName: "opencode", fpm: ["upstream.desktop=/usr/share/applications/upstream.desktop"] },
  }
  const config = bocBuilderConfig(base)
  expect(config.deb?.fpm).toHaveLength(1)
  expect(config.deb?.fpm?.[0]).not.toContain("upstream.desktop")
  expect(config.rpm?.packageName).toBe("boc-beta")
  expect(config.protocols).toEqual({ name: "Boc Beta", schemes: ["opencode"] })
  expect(config.artifactName).toBe("boc-desktop-${version}-${os}-${arch}.${ext}")
  expect(config.publish).toEqual({ provider: "generic", url: "https://boc-updates.bergdev.de", channel: "latest" })
})

test("preserves signed Windows policy and explicitly bypasses signing for unsigned releases", () => {
  const signed = bocBuilderConfig(upstream as Configuration, {
    windowsSigning: true,
    publisher: "Boc Release Publisher",
  })
  expect(signed.win?.signtoolOptions?.sign).toBe(upstream.win?.signtoolOptions?.sign)
  expect(signed.win?.signtoolOptions?.publisherName).toBe("Boc Release Publisher")
  expect(signed.win?.verifyUpdateCodeSignature).toBe(true)
  const unsigned = bocBuilderConfig(upstream as Configuration, {
    windowsSigning: false,
    publisher: "Boc Release Publisher",
  })
  expect(unsigned.win?.signtoolOptions?.publisherName).toBeUndefined()
  expect(unsigned.win?.verifyUpdateCodeSignature).toBe(false)
  expect(unsigned.win?.signtoolOptions?.sign).not.toBe(upstream.win?.signtoolOptions?.sign)
})

test("keeps source/download selection and Electron arguments explicit", () => {
  expect(developmentOptions(["--build-server", "--host", "127.0.0.1", "--port", "4444"])).toEqual({
    download: undefined,
    electron: ["--host", "127.0.0.1", "--port", "4444"],
  })
  expect(developmentOptions(["--download-server=fixture", "--", "--debug"])).toEqual({
    download: "fixture",
    electron: ["--", "--debug"],
  })
  expect(developmentOptions(["--download-server", "fixture", "--debug"])).toEqual({
    download: "fixture",
    electron: ["--debug"],
  })
  expect(() => developmentOptions(["--build-server", "--download-server", "fixture"])).toThrow()
  expect(() => developmentOptions(["--download-server"])).toThrow()
  const source = developmentEnvironment(undefined, "2.0.0-local-fixture", {})
  expect(source.OPENCODE_CHANNEL).toBe("local")
  expect(source.OPENCODE_DESKTOP_SERVER_CHANNEL).toBe("boc")
  expect(source.OPENCODE_DESKTOP_ISOLATED_SERVER).toBe("1")
  expect(source.OPENCODE_DISABLE_CHANNEL_DB).toBe("0")
  expect(source.OPENCODE_DESKTOP_WSL_CLI_BUILD).toBe(path.resolve(desktopDirectory, "../cli/script/build.ts"))
  expect(developmentEnvironment("fixture", "2.0.0-local-fixture", source).OPENCODE_DESKTOP_CLI_DEV).toBeUndefined()
})
