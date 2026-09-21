import { $ } from "bun"
import { chmod, copyFile, cp, mkdir, rm } from "node:fs/promises"
import path from "node:path"
import { getCurrentCli } from "../../../desktop/scripts/utils"
import { desktopDirectory } from "./paths"

export async function prepareBocIcons(local: boolean) {
  const destination = path.join(desktopDirectory, "resources/icons")
  await rm(destination, { recursive: true, force: true })
  await cp(path.join(desktopDirectory, "icons", local ? "boc-dev" : "boc"), destination, { recursive: true })
}

export async function stageBocCli(
  root: string,
  target?: string,
  resources = path.join(desktopDirectory, "resources"),
) {
  const cli = getCurrentCli(target)
  const filename = cli.os === "win32" ? "opencode.exe" : "opencode"
  const packageDirectory = path.join(root, cli.package.replace("@opencode/", ""))
  const destination = path.join(resources, cli.os === "win32" ? "opencode-cli.exe" : "opencode-cli")
  await mkdir(resources, { recursive: true })
  await copyFile(path.join(packageDirectory, "bin", filename), destination)
  const manifest = (await Bun.file(path.join(packageDirectory, "package.json")).json()) as { version?: string }
  if (!manifest.version) throw new Error(`Bundled CLI package has no version: ${packageDirectory}`)
  await Bun.write(path.join(resources, "opencode-cli.version"), manifest.version)
  if (cli.os !== "win32") await chmod(destination, 0o755)
  if (
    cli.os === "win32" &&
    process.platform === "win32" &&
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.OPENCODE_WINDOWS_SIGNING !== "false"
  ) {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${destination}`.cwd(
      desktopDirectory,
    )
  }
  if (cli.os === "darwin" && process.platform === "darwin") await $`codesign --force --sign - ${destination}`
}
