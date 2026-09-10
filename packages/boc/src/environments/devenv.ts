import fs from "node:fs/promises"
import path from "node:path"
import { Option, Schema } from "effect"
import { BocEnvironment } from "@opencode/schema/boc/environment"

export type Command = {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly outputLimit?: number
}

export type CommandResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type CommandRunner = (command: Command) => Promise<CommandResult>

export type StackAssignment = {
  readonly stackID: string
  readonly composeProject: string
  readonly infrastructureProject: string
  readonly host: string
  readonly url: string
  readonly sourceDirectory: string
}

export type ContainerInspection = {
  readonly status: "unknown" | "absent" | "stopped" | "running" | "partial"
  readonly total: number
  readonly running: number
  readonly owned: boolean
  readonly items?: readonly BocEnvironment.Container[]
}

export type DevenvInstallation = {
  readonly executable: string
  readonly root: string
  readonly up: string
  readonly down: string
  readonly environment: Readonly<Record<string, string>>
}

const DEFAULT_DOMAIN = "bergfreunde.de"

export async function resolveDevenv(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DevenvInstallation | undefined> {
  if (process.platform !== "darwin" && process.platform !== "linux") return
  const executable = await findExecutable("devenv", environment.PATH)
  if (!executable) return
  const resolved = await fs.realpath(executable).catch(() => undefined)
  if (!resolved) return
  const root = path.dirname(resolved)
  const up = path.join(root, "scripts", "worktree-up.sh")
  const down = path.join(root, "scripts", "worktree-down.sh")
  if (!(await isExecutable(resolved)) || !(await isExecutable(up)) || !(await isExecutable(down))) return
  return {
    executable,
    root,
    up,
    down,
    environment: processEnvironment(environment, resolved, root),
  }
}

export function inspectStack(
  installation: DevenvInstallation,
  directory: string,
  configured?: StackAssignment,
): { status: "unconfigured" } | { status: "invalid" } | { status: "configured"; assignment: StackAssignment } {
  if (!configured) return { status: "unconfigured" }
  const domain = assignmentDomain(configured)
  const expected = domain ? createStackAssignment(installation, directory, domain) : undefined
  if (!expected || !sameAssignment(configured, expected)) return { status: "invalid" }
  return { status: "configured", assignment: expected }
}

export function createStackAssignment(
  installation: DevenvInstallation,
  directory: string,
  domain = DEFAULT_DOMAIN,
): StackAssignment | undefined {
  const laneTrees = path.join(installation.root, "src", ".lane", "trees")
  const laneName = path.relative(laneTrees, directory)
  if (!laneName || laneName.startsWith(`..${path.sep}`) || path.isAbsolute(laneName) || laneName.includes(path.sep))
    return
  const stackID = laneName
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!stackID || stackID.length > 48 || !validDomain(domain)) return
  const infrastructureProject =
    installation.environment.DEVENV_INFRASTRUCTURE_PROJECT || path.basename(installation.root)
  const host = `${stackID}.${domain}.localhost`
  return {
    stackID,
    composeProject: `devenv-${stackID}`,
    infrastructureProject,
    host,
    url: `https://${host}/`,
    sourceDirectory: directory,
  }
}

export async function inspectContainers(
  installation: DevenvInstallation,
  stack: StackAssignment,
  run: CommandRunner = runCommand,
): Promise<ContainerInspection> {
  const listed = await run({
    executable: "docker",
    args: [
      "ps",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${stack.composeProject}`,
    ],
    env: installation.environment,
  }).catch(() => undefined)
  if (!listed || listed.exitCode !== 0) return { status: "unknown", total: 0, running: 0, owned: false }
  const ids = listed.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
  if (ids.length === 0) return { status: "absent", total: 0, running: 0, owned: true }
  const inspected = await run({
    executable: "docker",
    args: ["inspect", ...ids],
    env: installation.environment,
  }).catch(() => undefined)
  if (!inspected || inspected.exitCode !== 0) return { status: "unknown", total: ids.length, running: 0, owned: false }
  const expectedFiles = [
    path.join(installation.root, "docker-compose.yml"),
    path.join(installation.root, "docker-compose.worktree.yml"),
  ]
  const containers = Option.getOrUndefined(decodeContainers(inspected.stdout))
  if (!containers || containers.length !== ids.length) {
    return { status: "unknown", total: ids.length, running: 0, owned: false }
  }
  const owned = containers.every((container) => {
    const labels = container.Config.Labels
    const files = (labels["com.docker.compose.project.config_files"] ?? "").split(",")
    const workingDirectory = labels["com.docker.compose.project.working_dir"]
    return (
      ids.includes(container.Id) &&
      labels["com.docker.compose.project"] === stack.composeProject &&
      !!workingDirectory &&
      path.resolve(workingDirectory) === installation.root &&
      expectedFiles.every((file) => files.includes(file))
    )
  })
  if (!owned) {
    return { status: "unknown", total: ids.length, running: 0, owned: false }
  }
  const running = containers.filter((value) => value.State.Running).length
  const status = running === 0 ? "stopped" : running === containers.length ? "running" : "partial"
  const items = containers
    .map(
      (container): BocEnvironment.Container => ({
        id: container.Id,
        name: container.Name.replace(/^\//, ""),
        service: container.Config.Labels["com.docker.compose.service"] || container.Name.replace(/^\//, ""),
        state: container.State.Status,
        health: container.State.Health?.Status ?? "none",
        exitCode: container.State.ExitCode,
        ports: Object.entries(container.NetworkSettings.Ports).flatMap(([port, bindings]) =>
          (bindings ?? []).map((binding) => `${binding.HostIp}:${binding.HostPort} → ${port}`),
        ),
      }),
    )
    .sort((left, right) => left.service.localeCompare(right.service) || left.name.localeCompare(right.name))
  return { status, total: containers.length, running, owned: true, items }
}

const DockerContainer = Schema.Struct({
  Id: Schema.String,
  Name: Schema.String,
  Config: Schema.Struct({ Labels: Schema.Record(Schema.String, Schema.String) }),
  State: Schema.Struct({
    Running: Schema.Boolean,
    Status: BocEnvironment.Container.fields.state,
    ExitCode: Schema.Number,
    Health: Schema.optional(Schema.Struct({ Status: BocEnvironment.Container.fields.health })),
  }),
  NetworkSettings: Schema.Struct({
    Ports: Schema.Record(
      Schema.String,
      Schema.NullOr(Schema.Array(Schema.Struct({ HostIp: Schema.String, HostPort: Schema.String }))),
    ),
  }),
})
const decodeContainers = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(DockerContainer)))

export async function checkReadiness(
  installation: DevenvInstallation,
  stack: StackAssignment,
  run: CommandRunner = runCommand,
  timeout = 15,
) {
  const response = await run({
    executable: "curl",
    args: [
      "-k",
      "-sS",
      "-D",
      "-",
      "-o",
      "/dev/null",
      "--connect-timeout",
      "2",
      "--max-time",
      String(timeout),
      stack.url,
    ],
    env: installation.environment,
  }).catch(() => undefined)
  if (!response || response.exitCode !== 0) return { ready: false as const }
  const statusCode = Number(response.stdout.match(/^HTTP\/\S+\s+(\d+)/m)?.[1])
  const stackHeader = response.stdout.match(/^x-devenv-worktree:\s*(.+)\r?$/im)?.[1]?.trim()
  return {
    ready: [200, 301, 302, 303, 307, 308].includes(statusCode) && stackHeader === stack.stackID,
    statusCode,
  }
}

export async function preflight(
  installation: DevenvInstallation,
  directory: string,
  action: "setup" | "start",
  run: CommandRunner = runCommand,
) {
  if (!(await isDirectory(path.join(directory, "shop")))) return false
  if (action === "setup") {
    if (!(await isDirectory(path.join(installation.root, "src", "common", "config")))) return false
    if (!(await isFile(path.join(installation.root, "src", "shop", "source", ".env")))) return false
    if (!(await secretsArePrepared(path.join(installation.root, "secrets")))) return false
  }
  const result = await run({
    executable: "docker",
    args: ["network", "inspect", "devenv-worktree-infra", "devenv-worktree-ingress"],
    env: installation.environment,
  }).catch(() => undefined)
  return result?.exitCode === 0
}

export const runCommand: CommandRunner = async (command) => {
  const child = Bun.spawn([command.executable, ...command.args], {
    cwd: command.cwd,
    env: command.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }
  const read = async (stream: ReadableStream<Uint8Array>, channel: "stdout" | "stderr") => {
    const reader = stream.getReader()
    const limit = command.outputLimit ?? 4 * 1024 * 1024
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
      const next = Buffer.concat([output[channel], chunk.value])
      let start = Math.max(0, next.byteLength - limit)
      while (start < next.byteLength && (next[start] & 0xc0) === 0x80) start += 1
      output[channel] = next.subarray(start)
    }
  }
  const [, , exitCode] = await Promise.all([read(child.stdout, "stdout"), read(child.stderr, "stderr"), child.exited])
  return { exitCode, stdout: output.stdout.toString("utf8"), stderr: output.stderr.toString("utf8") }
}

async function findExecutable(name: string, value: string | undefined) {
  for (const directory of (value ?? "").split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, name)
    if (await isExecutable(candidate)) return candidate
  }
}

async function isExecutable(value: string) {
  return fs.access(value, fs.constants.X_OK).then(
    () => true,
    () => false,
  )
}

async function isDirectory(value: string) {
  return fs.stat(value).then(
    (stat) => stat.isDirectory(),
    () => false,
  )
}

async function isFile(value: string) {
  return fs.stat(value).then(
    (stat) => stat.isFile(),
    () => false,
  )
}

async function secretsArePrepared(directory: string) {
  if (!(await isDirectory(directory))) return false
  const entries = await fs.readdir(directory, { recursive: true }).catch(() => [])
  const examples = entries.filter((name) => name.endsWith(".txt.example"))
  return (
    await Promise.all(examples.map((name) => isFile(path.join(directory, name.slice(0, -".example".length)))))
  ).every(Boolean)
}

function processEnvironment(environment: NodeJS.ProcessEnv, executable: string, root: string) {
  const keys = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "SSH_AUTH_SOCK",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "DEVENV_INFRASTRUCTURE_PROJECT",
  ]
  return {
    ...Object.fromEntries(keys.flatMap((key) => (environment[key] ? [[key, environment[key]]] : []))),
    DEVENV_BIN: executable,
    DEVENV_BASE_DIRECTORY: root,
    TERM: "xterm-256color",
    COMPOSE_PROGRESS: "plain",
    COMPOSE_ANSI: "never",
  }
}

function assignmentDomain(assignment: StackAssignment) {
  const prefix = `${assignment.stackID}.`
  const suffix = ".localhost"
  if (!assignment.host.startsWith(prefix) || !assignment.host.endsWith(suffix)) return
  return assignment.host.slice(prefix.length, -suffix.length)
}

function validDomain(domain: string) {
  if (!domain || domain.length > 253 || !/^[a-zA-Z0-9.-]+$/.test(domain)) return false
  return domain
    .split(".")
    .every((label) => label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-"))
}

function sameAssignment(left: StackAssignment, right: StackAssignment) {
  return (
    left.stackID === right.stackID &&
    left.composeProject === right.composeProject &&
    left.infrastructureProject === right.infrastructureProject &&
    left.host === right.host &&
    left.url === right.url &&
    left.sourceDirectory === right.sourceDirectory
  )
}
