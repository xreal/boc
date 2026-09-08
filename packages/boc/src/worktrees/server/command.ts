import { spawn } from "node:child_process"
import path from "node:path"

export const RIFT_COMMAND_TIMEOUT_MS = 120_000
export const RIFT_COMMAND_MAX_BYTES = 1024 * 1024

export type Command = {
  executable: string
  args: readonly string[]
  cwd?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
  onOutput?: (value: string) => void
}

export type CommandResult =
  | { ok: true; exitCode: 0; stdout: string; stderr: string }
  | {
      ok: false
      reason: "cancelled" | "failed" | "not-found" | "output-limit" | "timeout"
      exitCode?: number
      stdout: string
      stderr: string
    }

export type CommandRunner = (command: Command) => Promise<CommandResult>

export const runCommand: CommandRunner = (command) =>
  new Promise((resolve) => {
    const child = spawn(command.executable, [...command.args], {
      cwd: command.cwd,
      env: commandEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const maxBytes = command.maxBytes ?? RIFT_COMMAND_MAX_BYTES
    let bytes = 0
    let settled = false
    let stopped: "cancelled" | "output-limit" | "timeout" | undefined

    const stop = (reason: typeof stopped) => {
      if (settled || stopped) return
      stopped = reason
      child.kill()
    }
    const output = () => ({
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    })
    const finish = (result: CommandResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      command.signal?.removeEventListener("abort", cancel)
      resolve(result)
    }
    const capture = (chunks: Buffer[], chunk: Buffer) => {
      bytes += chunk.byteLength
      if (bytes > maxBytes) return stop("output-limit")
      chunks.push(chunk)
      command.onOutput?.(chunk.toString("utf8"))
    }
    const cancel = () => stop("cancelled")
    const timeout = setTimeout(() => stop("timeout"), command.timeoutMs ?? RIFT_COMMAND_TIMEOUT_MS)

    child.stdout.on("data", (chunk: Buffer) => capture(stdout, chunk))
    child.stderr.on("data", (chunk: Buffer) => capture(stderr, chunk))
    child.once("error", (error: NodeJS.ErrnoException) =>
      finish({
        ok: false,
        reason: error.code === "ENOENT" ? "not-found" : (stopped ?? "failed"),
        ...output(),
      }),
    )
    child.once("close", (exitCode) => {
      if (stopped) return finish({ ok: false, reason: stopped, ...output() })
      if (exitCode === 0) return finish({ ok: true, exitCode: 0, ...output() })
      finish({ ok: false, reason: "failed", ...(exitCode === null ? {} : { exitCode }), ...output() })
    })

    if (command.signal?.aborted) cancel()
    else command.signal?.addEventListener("abort", cancel, { once: true })
  })

function commandEnvironment() {
  const environment = { ...process.env }
  const appDirectory = environment.APPDIR
  for (const key of ["APPDIR", "APPIMAGE", "ARGV0", "CHROME_DESKTOP", "GSETTINGS_SCHEMA_DIR", "OWD"]) {
    delete environment[key]
  }
  for (const key of ["PATH", "LD_LIBRARY_PATH", "XDG_DATA_DIRS"] as const) {
    if (!environment[key]) continue
    environment[key] = environment[key]
      .split(path.delimiter)
      .filter((entry) => entry && !(appDirectory && entry.startsWith(appDirectory)) && !entry.includes("/tmp/.mount_"))
      .join(path.delimiter)
  }
  for (const key of ["PYTHONHOME", "PYTHONPATH"] as const) {
    if (
      environment[key]
        ?.split(path.delimiter)
        .some((entry) => entry.includes("/tmp/.mount_") || (appDirectory && entry.startsWith(appDirectory)))
    ) {
      delete environment[key]
    }
  }
  return environment
}
