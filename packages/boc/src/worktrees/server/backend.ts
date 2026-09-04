import { Git } from "@opencode-ai/core/git"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Worktree } from "@opencode-ai/core/worktree"
import { Effect } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/util/global"
import { RIFT_BACKEND_VERSION } from "../shared/capability"
import { inspectRiftCapability } from "./capability"
import { runCommand, type CommandResult, type CommandRunner } from "./command"
import { claimTemplateRoot, createMetadataStore, metadataKey, type RiftCheckout } from "./metadata"
import { RIFT_STRATEGY } from "./registration"

export type RiftBackendOptions = {
  binary?: string
  stateDirectory: string
  platform?: NodeJS.Platform
  arch?: string
  run?: CommandRunner
}

class RiftOperationError extends Error {
  constructor(
    message: string,
    readonly forceRequired = false,
  ) {
    super(message)
  }
}

export function defaultRiftOptions(): RiftBackendOptions {
  return {
    binary: process.env.BOC_RIFT_BINARY,
    stateDirectory: process.env.BOC_RIFT_STATE_DIRECTORY ?? path.join(Global.Path.state, "boc", "rift"),
  }
}

export function createRiftBackend(options: RiftBackendOptions = defaultRiftOptions()) {
  const run = options.run ?? runCommand
  const registry = path.join(options.stateDirectory, "registry.sqlite")
  const metadata = createMetadataStore(options.stateDirectory)
  let mutations = Promise.resolve()

  const serialize = <A>(operation: () => Promise<A>) => {
    const result = mutations.then(operation, operation)
    mutations = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const capability = (directory: string) => inspectRiftCapability({ ...options, directory, run })
  const rift = (args: readonly string[], cwd?: string) => {
    if (!options.binary) return Promise.resolve(missingBinary())
    return run({ executable: options.binary, args: ["--database", registry, ...args], cwd })
  }

  const strategy: Worktree.Strategy = {
    id: RIFT_STRATEGY,
    create: (input) =>
      Effect.tryPromise({
        try: () => serialize(() => createCheckout(input)),
        catch: (cause) => worktreeError("create", input.directory, cause),
      }),
    list: (sourceDirectory) =>
      Effect.tryPromise({
        try: () => listCheckouts(sourceDirectory),
        catch: (cause) => worktreeError("list", sourceDirectory, cause),
      }),
    remove: (input) =>
      Effect.tryPromise({
        try: () => serialize(() => removeCheckout(input)),
        catch: (cause) => worktreeError("remove", input.directory, cause),
      }),
  }

  return { strategy, capability }

  async function createCheckout(input: Parameters<Worktree.Strategy["create"]>[0]) {
    const availability = await capability(input.directory)
    if (!availability.available) throw new RiftOperationError(availability.message)
    const destination = await safeDestination(input.directory)
    const sourceRecord = await metadata.read(input.sourceDirectory)
    const sourceDirectory = AbsolutePath.make(sourceRecord?.sourceDirectory ?? input.sourceDirectory)
    const commit = await resolveCommit(input.sourceDirectory, input.branch)
    const templateDirectory = AbsolutePath.make(
      path.join(destination.parent, ".boc-rift", metadataKey(sourceDirectory), "template"),
    )

    await prepareTemplate(input.sourceDirectory, sourceDirectory, templateDirectory, commit)
    await fs.mkdir(options.stateDirectory, { recursive: true })
    requireSuccess(await rift(["init", "--here", templateDirectory]), "Rift template initialization failed")

    const pending: RiftCheckout = {
      version: 1,
      state: "creating",
      sourceDirectory,
      templateDirectory,
      directory: destination.directory,
      registry,
      commit,
      artifactVersion: RIFT_BACKEND_VERSION,
    }
    await metadata.write(pending)
    const created = requireSuccess(
      await rift([
        "create",
        "--copy-all",
        "--no-hooks",
        "--name",
        destination.name,
        "--into",
        destination.parent,
        templateDirectory,
      ]),
      "Rift checkout creation failed",
    )
    const directory = AbsolutePath.make(await fs.realpath(created.stdout.trim()))
    if (directory !== destination.directory) throw new RiftOperationError("Rift created an unexpected checkout path.")
    await verifyCreatedCheckout(templateDirectory, directory, commit)
    await metadata.write({ ...pending, state: "active", marker: await readMarker(directory) })
    return { directory }
  }

  async function listCheckouts(sourceDirectory: AbsolutePath): Promise<Worktree.ListEntry[]> {
    const availability = await capability(sourceDirectory)
    if (!availability.available) return []
    const records = (await metadata.list()).filter(
      (record) => record.sourceDirectory === sourceDirectory && record.state !== "removed",
    )
    const templates = new Map(records.map((record) => [record.templateDirectory, record]))
    const active = new Set<string>()
    for (const template of templates.keys()) {
      const listed = await rift(["list", template])
      if (!listed.ok) continue
      listed.stdout
        .split(/\r?\n/)
        .map((directory) => directory.trim())
        .filter(Boolean)
        .forEach((directory) => active.add(path.resolve(directory)))
    }
    const children = await Promise.all(
      records
        .filter((record) => active.has(path.resolve(record.directory)))
        .map(async (record): Promise<Worktree.ListEntry | undefined> => {
          const directory = AbsolutePath.make(await fs.realpath(record.directory))
          if (record.marker && record.marker !== (await readMarker(directory))) return undefined
          return { directory, type: "worktree" }
        }),
    )
    return [{ directory: sourceDirectory, type: "root" }, ...children.filter((item) => item !== undefined)]
  }

  async function removeCheckout(input: Parameters<Worktree.Strategy["remove"]>[0]) {
    const record = await metadata.read(input.directory)
    if (!record || record.state === "removed") throw new RiftOperationError("Rift checkout ownership is missing.")
    const directory = AbsolutePath.make(await fs.realpath(input.directory))
    if (directory !== record.directory) throw new RiftOperationError("Rift checkout path ownership does not match.")
    if (record.marker && record.marker !== (await readMarker(directory))) {
      throw new RiftOperationError("Rift checkout identity does not match its ownership record.")
    }
    const ancestors = requireSuccess(await rift(["ancestors", directory]), "Rift checkout ancestry is unavailable")
    if (lines(ancestors.stdout)[0] !== record.templateDirectory) {
      throw new RiftOperationError("Rift checkout is not owned by its recorded template.")
    }
    const descendants = requireSuccess(await rift(["list", directory]), "Rift descendants could not be checked")
    if (lines(descendants.stdout).length > 0) {
      throw new RiftOperationError("Remove descendant Rift checkouts before removing this checkout.")
    }
    if (!input.force && (await wouldLoseWork(record))) {
      throw new RiftOperationError("Rift checkout contains changes or independent Git history.", true)
    }
    requireSuccess(await rift(["remove", directory]), "Rift checkout removal failed")
    await metadata.write({ ...record, state: "removed" })
  }

  async function prepareTemplate(
    source: AbsolutePath,
    canonicalSource: AbsolutePath,
    template: AbsolutePath,
    commit: string,
  ) {
    if (!(await claimTemplateRoot(path.dirname(template), canonicalSource))) {
      throw new RiftOperationError("Rift template storage is not owned by Boc.")
    }
    const templateStat = await fs.lstat(template).catch(() => undefined)
    if (templateStat && (!templateStat.isDirectory() || templateStat.isSymbolicLink())) {
      throw new RiftOperationError("Rift template path is not a safe directory.")
    }
    const dotGit = path.join(template, ".git")
    if (!templateStat) {
      await requireGit(
        source,
        ["clone", "--no-hardlinks", "--no-checkout", "--", source, template],
        "Rift template clone failed",
      )
    }
    const dotGitStat = await fs.lstat(dotGit).catch(() => undefined)
    if (!dotGitStat?.isDirectory() || dotGitStat.isSymbolicLink()) {
      throw new RiftOperationError("Rift template is not a standalone Git repository.")
    }

    await requireGit(template, ["fetch", "--force", "--no-tags", source, commit], "Rift template refresh failed")
    await syncRemotes(source, template)
    await requireGit(template, ["checkout", "--detach", "--force", commit], "Rift template checkout failed")
    await requireGit(template, ["reset", "--hard", commit], "Rift template reset failed")
    await requireGit(template, ["clean", "-fdx", "-e", ".rift"], "Rift template cleanup failed")
  }

  async function syncRemotes(source: AbsolutePath, template: AbsolutePath) {
    const sourceRemotes = lines((await requireGit(source, ["remote"], "Git remotes could not be read")).stdout)
    const templateRemotes = lines((await requireGit(template, ["remote"], "Template remotes could not be read")).stdout)
    for (const remote of templateRemotes) {
      await requireGit(template, ["remote", "remove", remote], "A stale template remote could not be removed")
    }
    for (const remote of sourceRemotes) {
      if (remote.startsWith("-")) throw new RiftOperationError("The repository contains an unsupported remote name.")
      const urls = lines(
        (await requireGit(source, ["config", "--get-all", `remote.${remote}.url`], "A remote URL could not be read"))
          .stdout,
      )
      if (!urls[0]) continue
      await requireGit(template, ["remote", "add", remote, urls[0]], "A template remote could not be added")
      for (const url of urls.slice(1)) {
        await requireGit(
          template,
          ["remote", "set-url", "--add", remote, url],
          "A template remote URL could not be added",
        )
      }
      const pushUrls = await run({
        executable: "git",
        args: ["config", "--get-all", `remote.${remote}.pushurl`],
        cwd: source,
      })
      if (!pushUrls.ok && pushUrls.reason !== "failed")
        throw new RiftOperationError("A remote push URL could not be read.")
      for (const url of pushUrls.ok ? lines(pushUrls.stdout) : []) {
        await requireGit(
          template,
          ["remote", "set-url", "--add", "--push", remote, url],
          "A template push URL could not be added",
        )
      }
    }
  }

  async function resolveCommit(source: AbsolutePath, ref = "HEAD") {
    const result = await requireGit(
      source,
      ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
      "The selected Git ref does not resolve to a commit",
    )
    const commit = result.stdout.trim()
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) throw new RiftOperationError("Git returned an invalid commit identity.")
    return commit
  }

  async function verifyCreatedCheckout(template: AbsolutePath, directory: AbsolutePath, commit: string) {
    const head = (
      await requireGit(directory, ["rev-parse", "HEAD"], "Created checkout HEAD is unavailable")
    ).stdout.trim()
    if (head !== commit) throw new RiftOperationError("Rift checkout does not contain the selected commit.")
    const symbolic = await run({ executable: "git", args: ["symbolic-ref", "-q", "HEAD"], cwd: directory })
    if (symbolic.ok) throw new RiftOperationError("Rift checkout HEAD is not detached.")
    if (!(await fs.stat(path.join(directory, ".git"))).isDirectory()) {
      throw new RiftOperationError("Rift checkout is not an independent Git repository.")
    }
    const listed = requireSuccess(await rift(["list", template]), "Rift checkout registration could not be verified")
    if (
      !lines(listed.stdout)
        .map((item) => path.resolve(item))
        .includes(path.resolve(directory))
    ) {
      throw new RiftOperationError("Rift checkout is missing from the private registry.")
    }
    await readMarker(directory)
  }

  async function wouldLoseWork(record: RiftCheckout) {
    const status = await requireGit(
      record.directory,
      ["status", "--porcelain", "--untracked-files=all"],
      "Rift checkout changes could not be inspected",
    )
    if (status.stdout.trim()) return true
    const head = (
      await requireGit(record.directory, ["rev-parse", "HEAD"], "Rift checkout HEAD is unavailable")
    ).stdout.trim()
    const refs = lines(
      (
        await requireGit(
          record.directory,
          ["for-each-ref", "--format=%(objectname)", "refs/heads", "refs/tags"],
          "Rift checkout refs could not be inspected",
        )
      ).stdout,
    )
    for (const commit of new Set([head, ...refs])) {
      const exists = await run({
        executable: "git",
        args: ["cat-file", "-e", `${commit}^{commit}`],
        cwd: record.templateDirectory,
      })
      if (!exists.ok) return true
    }
    return false
  }

  async function requireGit(cwd: string, args: readonly string[], message: string) {
    return requireSuccess(await run({ executable: "git", args, cwd }), message)
  }
}

async function safeDestination(directory: AbsolutePath) {
  const resolved = path.resolve(directory)
  const parent = await fs.realpath(path.dirname(resolved))
  const name = path.basename(resolved)
  const expected = path.join(parent, name)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) || path.basename(expected) !== name) {
    throw new RiftOperationError("Rift checkout name is not a safe path segment.")
  }
  return { parent, name, directory: AbsolutePath.make(expected) }
}

async function readMarker(directory: string) {
  const marker = (await fs.readFile(path.join(directory, ".rift"), "utf8")).trim()
  if (!marker) throw new RiftOperationError("Rift checkout marker is missing.")
  return marker
}

function requireSuccess(result: CommandResult, message: string) {
  if (result.ok) return result
  throw new RiftOperationError(message)
}

function missingBinary(): CommandResult {
  return { ok: false, reason: "not-found", stdout: "", stderr: "" }
}

function worktreeError(operation: Git.WorktreeError["operation"], directory: AbsolutePath, cause: unknown) {
  return new Git.WorktreeError({
    operation,
    directory,
    message: cause instanceof RiftOperationError ? cause.message : `Rift ${operation} failed`,
    forceRequired: cause instanceof RiftOperationError && cause.forceRequired ? true : undefined,
  })
}

function lines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
