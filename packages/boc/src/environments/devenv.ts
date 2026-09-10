import fs from "node:fs/promises"
import path from "node:path"

export type Command = {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
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
  readonly configFile: string
}

export type ContainerInspection = {
  readonly status: "unknown" | "absent" | "stopped" | "running" | "partial"
  readonly total: number
  readonly running: number
  readonly owned: boolean
}

export type DevenvInstallation = {
  readonly executable: string
  readonly root: string
  readonly setup: string
  readonly environment: Readonly<Record<string, string>>
}

const STACK_KEYS = new Set([
  "STACK_ID",
  "STACK_BRANCH",
  "STACK_DOMAIN",
  "COMPOSE_PROJECT_NAME",
  "DEVENV_SHARED_INFRASTRUCTURE",
  "INFRASTRUCTURE_PROJECT_NAME",
  "STACK_HOST",
  "SHOP_CONTAINER_NAME",
  "DEVENV_SRC_PATH",
])

export async function resolveDevenv(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<DevenvInstallation | undefined> {
  if (process.platform !== "darwin" && process.platform !== "linux") return
  const executable = await findExecutable("devenv", environment.PATH)
  if (!executable) return
  const resolved = await fs.realpath(executable).catch(() => undefined)
  if (!resolved) return
  const root = path.dirname(resolved)
  const setup = path.join(root, "scripts", "worktree-setup.sh")
  if (!(await isExecutable(resolved)) || !(await isExecutable(setup))) return
  return {
    executable,
    root,
    setup,
    environment: processEnvironment(environment, resolved, root),
  }
}

export async function inspectStack(
  installation: DevenvInstallation,
  directory: string,
): Promise<{ status: "unconfigured" } | { status: "invalid" } | { status: "configured"; assignment: StackAssignment }> {
  const configDirectory = path.join(installation.root, ".devenv", "worktrees")
  const files = await fs.readdir(configDirectory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const domains = new Set(
    (await fs.readFile(path.join(installation.root, "config", "storefront-domains.txt"), "utf8").catch(() => ""))
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value && !value.startsWith("#")),
  )
  const configurations = await Promise.all(
    files
      .filter((name) => name.endsWith(".env"))
      .map(async (name) => {
        const configFile = path.join(configDirectory, name)
        const configuredSources = await readAssignmentValues(configFile, "DEVENV_SRC_PATH").catch(() => [])
        const sourceDirectories = await Promise.all(
          configuredSources.flatMap((value) =>
            value === undefined ? [] : [fs.realpath(value).catch(() => path.resolve(value))],
          ),
        )
        if (!sourceDirectories.includes(directory)) return
        if (configuredSources.length !== 1 || sourceDirectories.length !== 1) return false
        const sourceDirectory = sourceDirectories[0]
        const values = await readAssignments(configFile, STACK_KEYS, true).catch(() => undefined)
        if (!values) return false
        return assignment(installation.root, configFile, values, sourceDirectory, domains)
      }),
  )
  if (configurations.some((value) => value === false)) return { status: "invalid" }
  const matches = configurations.filter((value): value is StackAssignment => value !== undefined && value !== false)
  if (matches.length === 0) return { status: "unconfigured" }
  if (matches.length !== 1) return { status: "invalid" }
  return { status: "configured", assignment: matches[0] }
}

export async function inspectContainers(
  installation: DevenvInstallation,
  stack: StackAssignment,
  run: CommandRunner = runCommand,
): Promise<ContainerInspection> {
  const listed = await run({
    executable: "docker",
    args: ["ps", "--all", "--quiet", "--filter", `label=com.docker.compose.project=${stack.composeProject}`],
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
    args: ["inspect", "--format", "{{json .Config.Labels}}\t{{.State.Running}}", ...ids],
    env: installation.environment,
  }).catch(() => undefined)
  if (!inspected || inspected.exitCode !== 0) return { status: "unknown", total: ids.length, running: 0, owned: false }
  const expectedFiles = [
    path.join(installation.root, "docker-compose.yml"),
    path.join(installation.root, "docker-compose.worktree.yml"),
  ]
  const containers = inspected.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const separator = line.lastIndexOf("\t")
      if (separator < 0) return
      const labels = parseLabels(line.slice(0, separator))
      if (!labels) return
      const files = (labels["com.docker.compose.project.config_files"] ?? "").split(",")
      const workingDirectory = labels["com.docker.compose.project.working_dir"]
      return {
        running: line.slice(separator + 1) === "true",
        owned:
          labels["com.docker.compose.project"] === stack.composeProject &&
          !!workingDirectory &&
          path.resolve(workingDirectory) === installation.root &&
          expectedFiles.every((file) => files.includes(file)),
      }
    })
  if (containers.length !== ids.length || containers.some((value) => !value?.owned)) {
    return { status: "unknown", total: ids.length, running: 0, owned: false }
  }
  const running = containers.filter((value) => value?.running).length
  const status = running === 0 ? "stopped" : running === containers.length ? "running" : "partial"
  return { status, total: containers.length, running, owned: true }
}

export async function checkReadiness(
  installation: DevenvInstallation,
  stack: StackAssignment,
  run: CommandRunner = runCommand,
) {
  const response = await run({
    executable: "curl",
    args: ["-k", "-sS", "-D", "-", "-o", "/dev/null", "--connect-timeout", "2", "--max-time", "15", stack.url],
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
  const configured: Record<string, string> = await readAssignments(
    path.join(installation.root, "dev.env"),
    new Set(["DEVENV_WORKTREE_INFRA_NETWORK", "DEVENV_WORKTREE_INGRESS_NETWORK"]),
  ).catch(() => ({}))
  const networks = [
    configured.DEVENV_WORKTREE_INFRA_NETWORK ?? "devenv-worktree-infra",
    configured.DEVENV_WORKTREE_INGRESS_NETWORK ?? "devenv-worktree-ingress",
  ]
  const result = await run({
    executable: "docker",
    args: ["network", "inspect", ...networks],
    env: installation.environment,
  }).catch(() => undefined)
  return result?.exitCode === 0
}

export async function supportsGuardedRemoval(
  installation: DevenvInstallation,
  directory: string,
  run: CommandRunner = runCommand,
) {
  const result = await run({
    executable: installation.executable,
    args: ["stack", "capabilities"],
    cwd: directory,
    env: installation.environment,
  }).catch(() => undefined)
  return result?.exitCode === 0 && result.stdout.trim() === "guarded-removal-v1"
}

export const runCommand: CommandRunner = async (command) => {
  const child = Bun.spawn([command.executable, ...command.args], {
    cwd: command.cwd,
    env: command.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { exitCode, stdout, stderr }
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

async function readAssignments(file: string, keys: ReadonlySet<string>, strict = false) {
  const result: Record<string, string> = {}
  for (const raw of (await fs.readFile(file, "utf8")).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (!match) throw new Error(`Invalid assignment in ${file}`)
    const value = decodeShellWord(match[2])
    if (!keys.has(match[1])) {
      if (strict) throw new Error(`Unexpected assignment in ${file}`)
      continue
    }
    if (result[match[1]] !== undefined) throw new Error(`Duplicate assignment in ${file}`)
    result[match[1]] = value
  }
  return result
}

async function readAssignmentValues(file: string, key: string) {
  return (await fs.readFile(file, "utf8"))
    .split(/\r?\n/)
    .map((raw) => raw.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/))
    .filter((match) => match?.[1] === key)
    .map((match) => {
      if (!match) return
      try {
        return decodeShellWord(match[2])
      } catch {
        return
      }
    })
}

function decodeShellWord(value: string) {
  if (/["'`$]/.test(value)) throw new Error("Unsupported shell quoting in generated devenv data")
  let result = ""
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "\\") {
      result += value[index]
      continue
    }
    index++
    if (index >= value.length) throw new Error("Invalid escape in generated devenv data")
    result += value[index]
  }
  return result
}

function assignment(
  root: string,
  configFile: string,
  values: Record<string, string>,
  sourceDirectory: string,
  domains: ReadonlySet<string>,
) {
  const stackID = values.STACK_ID
  const domain = values.STACK_DOMAIN
  if (!stackID || !/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(stackID)) return false
  if (!domain || !domains.has(domain) || !values.INFRASTRUCTURE_PROJECT_NAME) return false
  const composeProject = `devenv-${stackID}`
  const host = `${stackID}.${domain}.localhost`
  if (
    values.COMPOSE_PROJECT_NAME !== composeProject ||
    values.DEVENV_SHARED_INFRASTRUCTURE !== "true" ||
    values.STACK_HOST !== host ||
    values.SHOP_CONTAINER_NAME !== `${composeProject}-shop` ||
    configFile !== path.join(root, ".devenv", "worktrees", `${stackID}.env`)
  )
    return false
  return {
    stackID,
    composeProject,
    infrastructureProject: values.INFRASTRUCTURE_PROJECT_NAME,
    host,
    url: `https://${host}/`,
    sourceDirectory,
    configFile,
  } satisfies StackAssignment
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
  ]
  return {
    ...Object.fromEntries(keys.flatMap((key) => (environment[key] ? [[key, environment[key]]] : []))),
    DEVENV_BIN: executable,
    DEVENV_BASE_DIRECTORY: root,
    TERM: "xterm-256color",
  }
}

function parseLabels(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return
    if (!Object.values(parsed).every((item) => typeof item === "string")) return
    return parsed as Record<string, string>
  } catch {
    return
  }
}
