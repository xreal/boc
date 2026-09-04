import path from "node:path"

type ForkSurface = {
  owned: string[]
  approved: Array<{ path: string; reason: string }>
}

const root = path.resolve(import.meta.dir, "../../..")
const surface = (await Bun.file(path.join(import.meta.dir, "../fork-surface.json")).json()) as ForkSurface
const base = await git(["merge-base", "HEAD", "upstream/beta"], "Fetch upstream/beta before running the BOC audit.")
const changed = (await git(["diff", "--name-only", `${base.trim()}...HEAD`])).split("\n").filter(Boolean)
const approved = new Set(surface.approved.map((entry) => entry.path))
const owned = surface.owned.map((pattern) => new Bun.Glob(pattern))
const unlisted = changed.filter((file) => !approved.has(file) && !owned.some((pattern) => pattern.match(file)))

if (unlisted.length > 0) {
  console.error(`Unlisted fork surface paths:\n${unlisted.join("\n")}`)
  process.exit(1)
}

console.log(`BOC fork surface audit passed (${changed.length} changed paths).`)

async function git(args: string[], failure?: string) {
  const subprocess = Bun.spawn(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
  const output = await new Response(subprocess.stdout).text()
  const error = await new Response(subprocess.stderr).text()
  const exitCode = await subprocess.exited

  if (exitCode === 0) return output
  console.error(failure ?? error.trim())
  process.exit(exitCode)
}
