import { join } from "node:path"
import { resolveRiftTarget } from "../../../boc/scripts/rift/target"

// Electron maps the local desktop channel to dev. Use the source-launch
// environment to identify this workflow without changing its desktop identity.
export function isBocSourceBackend(channel: string, environment: NodeJS.ProcessEnv = process.env) {
  return !!environment.OPENCODE_DESKTOP_CLI_DEV && (environment.OPENCODE_CHANNEL === "local" || channel === "boc")
}

export function usesRiftRuntime(channel: string, environment: NodeJS.ProcessEnv = process.env) {
  return channel === "boc" || isBocSourceBackend(channel, environment)
}

export function bocServiceFile(channel: string, directory: string, environment: NodeJS.ProcessEnv = process.env) {
  if (channel === "boc" || isBocSourceBackend(channel, environment)) return join(directory, "opencode", "service.json")
}

export function developmentRiftSource(resourcesRoot: string) {
  return join(
    resourcesRoot,
    "../../boc/resources/rift",
    resolveRiftTarget(process.platform, process.arch) ?? "unsupported",
    "rift",
  )
}
