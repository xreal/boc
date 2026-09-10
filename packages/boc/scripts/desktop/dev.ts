import { $ } from "bun"
import path from "node:path"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"
import { downloadCliToResources, windowsify } from "../../../desktop/scripts/utils"
import { desktopDirectory } from "./paths"
import { prepareBocIcons } from "./resources"

export function developmentOptions(args: string[]) {
  const parsed = parseArgs({
    args,
    options: { "build-server": { type: "boolean" }, "download-server": { type: "string" } },
    strict: false,
    allowPositionals: true,
    tokens: true,
  })
  if (parsed.values["build-server"] && parsed.values["download-server"] !== undefined)
    throw new Error("--build-server and --download-server cannot be used together")
  const download = parsed.values["download-server"]
  if (download !== undefined && (typeof download !== "string" || !download))
    throw new Error("--download-server requires a version")
  const consumed = new Set(
    parsed.tokens.flatMap((token) => {
      if (token.kind !== "option" || !["build-server", "download-server"].includes(token.name)) return []
      return token.value !== undefined && !token.inlineValue ? [token.index, token.index + 1] : [token.index]
    }),
  )
  return {
    download,
    electron: args.filter((_, index) => !consumed.has(index)),
  }
}

export function developmentEnvironment(download: string | undefined, version: string, environment = process.env) {
  const cli = path.resolve(desktopDirectory, "../cli")
  return {
    ...environment,
    OPENCODE_CHANNEL: "local",
    OPENCODE_VERSION: version,
    OPENCODE_DISABLE_CHANNEL_DB: "0",
    OPENCODE_DESKTOP_ISOLATED_SERVER: "1",
    OPENCODE_DESKTOP_CLI_DEV: download ? undefined : cli,
    OPENCODE_DESKTOP_SERVER_CHANNEL: download ? undefined : "boc",
    OPENCODE_DESKTOP_WSL_CLI_BUILD: download ? undefined : path.join(cli, "script/build.ts"),
    OPENCODE_DESKTOP_WSL_CLI_OUTPUT: download ? undefined : path.join(desktopDirectory, "resources/opencode-cli-wsl"),
  }
}

export async function prepareBocDevelopment(options: ReturnType<typeof developmentOptions>) {
  const environment = developmentEnvironment(options.download, `2.0.0-local-${Date.now()}`)
  await Promise.all([$`bun run install-electron`.cwd(desktopDirectory), prepareBocIcons(true)])
  if (options.download) {
    await downloadCliToResources(
      options.download,
      windowsify(path.join(desktopDirectory, "resources/opencode-cli-dev")),
    )
    return environment
  }
  await $`bun run --cwd ${path.resolve(desktopDirectory, "../cli")} --define=OPENCODE_VERSION=${JSON.stringify(environment.OPENCODE_VERSION)} src/index.ts --version`.env(
    environment,
  )
  return environment
}

async function main() {
  const options = developmentOptions(process.argv.slice(2))
  const environment = await prepareBocDevelopment(options)
  process.exitCode = await Bun.spawn(
    [
      "node",
      path.resolve(
        createRequire(path.join(desktopDirectory, "package.json")).resolve("electron-vite"),
        "../../bin/electron-vite.js",
      ),
      "dev",
      ...options.electron,
    ],
    { cwd: desktopDirectory, env: environment, stdio: ["inherit", "inherit", "inherit"] },
  ).exited
}

if (import.meta.main) await main()
