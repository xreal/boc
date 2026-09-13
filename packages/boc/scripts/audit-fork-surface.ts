import path from "node:path"

type ForkSurface = {
  owned: string[]
  approved: Array<{ path: string; reason: string }>
}

const root = path.resolve(import.meta.dir, "../../..")
const surface = (await Bun.file(path.join(import.meta.dir, "../fork-surface.json")).json()) as ForkSurface
const base = await git(["merge-base", "HEAD", "upstream/v2"], "Fetch upstream/v2 before running the BOC audit.")
const changed = new Set(
  (
    await Promise.all([
      git(["diff", "--name-only", "--no-renames", "-z", base.trim()]),
      git(["ls-files", "--others", "--exclude-standard", "-z"]),
    ])
  ).flatMap((output) => output.split("\0").filter(Boolean)),
)
const approved = new Set(surface.approved.map((entry) => entry.path))
const owned = surface.owned.map((pattern) => new Bun.Glob(pattern))
const upstream = [...changed].filter((file) => !owned.some((pattern) => pattern.match(file)))
const unlisted = upstream.filter((file) => !approved.has(file))
const stale = [...approved].filter((file) => !upstream.includes(file))
const duplicates = surface.approved
  .filter((entry, index) => surface.approved.findIndex((candidate) => candidate.path === entry.path) !== index)
  .map((entry) => entry.path)
const failures = [
  { label: "Unlisted fork surface paths", paths: unlisted },
  { label: "Stale fork surface approvals", paths: stale },
  { label: "Duplicate fork surface approvals", paths: duplicates },
].filter((failure) => failure.paths.length > 0)

if (failures.length > 0) {
  failures.forEach((failure) => console.error(`${failure.label}:\n${failure.paths.join("\n")}`))
  process.exit(1)
}

console.log(
  `BOC fork surface audit passed (${upstream.length} upstream-owned paths; ${changed.size} total changed paths, including working tree).`,
)

async function git(args: string[], failure?: string) {
  const subprocess = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
  const output = await new Response(subprocess.stdout).text()
  const error = await new Response(subprocess.stderr).text()
  const exitCode = await subprocess.exited

  if (exitCode === 0) return output
  console.error(failure ?? error.trim())
  process.exit(exitCode)
}
