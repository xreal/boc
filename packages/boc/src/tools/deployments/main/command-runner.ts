import { spawn } from "node:child_process"
import path from "node:path"

export const DEPLOYMENT_COMMAND_TIMEOUT_MS = 30_000
export const DEPLOYMENT_COMMAND_MAX_BYTES = 2 * 1024 * 1024

export type DeploymentCommand = {
  executable: string
  args: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string | undefined>>
  stdin?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
}

export type DeploymentCommandResult =
  | { ok: true; exitCode: 0; stdout: string; stderr: string }
  | {
      ok: false
      reason: "cancelled" | "failed" | "not-found" | "output-limit" | "timeout"
      exitCode?: number
      stdout: string
      stderr: string
    }

export type DeploymentCommandRunner = (command: DeploymentCommand) => Promise<DeploymentCommandResult>

const packagedAppKeys = ["APPDIR", "APPIMAGE", "ARGV0", "CHROME_DESKTOP", "GSETTINGS_SCHEMA_DIR", "OWD"] as const
const packagedPathKeys = ["PATH", "LD_LIBRARY_PATH", "XDG_DATA_DIRS"] as const
const packagedPythonKeys = ["PYTHONHOME", "PYTHONPATH"] as const

export function packagedCommandEnvironment(
  inherited: Readonly<NodeJS.ProcessEnv> = process.env,
  extra: Readonly<Record<string, string | undefined>> = {},
) {
  const environment = Object.fromEntries(
    Object.entries({ ...inherited, ...extra }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const appDirectory = environment.APPDIR
  packagedAppKeys.forEach((key) => delete environment[key])
  packagedPathKeys.forEach((key) => {
    if (!environment[key]) return
    const clean = environment[key]
      .split(path.delimiter)
      .filter((entry) => entry && !packagedPathEntry(entry, appDirectory))
      .join(path.delimiter)
    if (clean) environment[key] = clean
    else delete environment[key]
  })
  packagedPythonKeys.forEach((key) => {
    if (environment[key]?.split(path.delimiter).some((entry) => packagedPathEntry(entry, appDirectory))) {
      delete environment[key]
    }
  })
  return environment
}

export function createDeploymentCommandRunner(
  environment: () => Readonly<NodeJS.ProcessEnv> = () => process.env,
): DeploymentCommandRunner {
  return (command) =>
    new Promise((resolve) => {
      const timeoutMs = command.timeoutMs ?? DEPLOYMENT_COMMAND_TIMEOUT_MS
      const maxBytes = command.maxBytes ?? DEPLOYMENT_COMMAND_MAX_BYTES
      const child = spawn(command.executable, [...command.args], {
        cwd: command.cwd,
        env: packagedCommandEnvironment(environment(), command.env),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let bytes = 0
      let settled = false
      let stopped: "cancelled" | "output-limit" | "timeout" | undefined

      const stop = (reason: typeof stopped) => {
        if (settled || stopped) return
        stopped = reason
        child.kill()
      }
      const finish = (result: DeploymentCommandResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        command.signal?.removeEventListener("abort", cancel)
        resolve(result)
      }
      const capture = (chunks: Buffer[], chunk: Buffer) => {
        bytes += chunk.byteLength
        if (bytes > maxBytes) {
          stop("output-limit")
          return
        }
        chunks.push(chunk)
      }
      const output = () => ({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      })
      const cancel = () => stop("cancelled")
      const timeout = setTimeout(() => stop("timeout"), timeoutMs)

      child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk))
      child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk))
      child.once("error", (error: NodeJS.ErrnoException) => {
        finish({
          ok: false,
          reason: error.code === "ENOENT" ? "not-found" : (stopped ?? "failed"),
          ...output(),
        })
      })
      child.once("close", (exitCode) => {
        if (stopped) {
          finish({ ok: false, reason: stopped, ...output() })
          return
        }
        if (exitCode === 0) {
          finish({ ok: true, exitCode: 0, ...output() })
          return
        }
        finish({ ok: false, reason: "failed", ...(exitCode === null ? {} : { exitCode }), ...output() })
      })

      if (command.signal?.aborted) cancel()
      else command.signal?.addEventListener("abort", cancel, { once: true })
      child.stdin.end(command.stdin)
    })
}

function packagedPathEntry(entry: string, appDirectory?: string) {
  return (appDirectory !== undefined && entry.startsWith(appDirectory)) || entry.includes("/tmp/.mount_")
}
