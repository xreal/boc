import assert from "node:assert/strict"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Service } from "../../../client/src/promise/service"
import { connectBocService, inspectBocService } from "../../../desktop/src/boc/background-service"

const root = await mkdtemp(path.join(tmpdir(), "bergflow-lifecycle-"))
const project = path.join(root, "project")
const shared = path.join(root, "state/opencode/service.json")
const isolated = path.join(root, "isolated/opencode/service.json")
if (process.argv.length < 5)
  throw new Error("Usage: lifecycle-smoke.ts <boc-binary> <compatible-original-binary> <incompatible-original-binary>")
const boc = path.resolve(process.argv[2]!)
const official = path.resolve(process.argv[3]!)
const newer = path.resolve(process.argv[4]!)
const plugin = path.resolve(import.meta.dir, "../../node_modules/@bergflow/opencode")
const version = "0.0.0-beta-19192"
const config = path.join(root, "config/opencode/opencode.json")
const env = {
  HOME: root,
  USERPROFILE: root,
  OPENCODE_TEST_HOME: root,
  OPENCODE_CONFIG_DIR: path.dirname(config),
  OPENCODE_CONFIG_PROJECT_DISABLE: "1",
  OPENCODE_DISABLE_MODELS_FETCH: "1",
  OPENCODE_DB: path.join(root, "opencode.db"),
  XDG_STATE_HOME: path.join(root, "state"),
  XDG_CONFIG_HOME: path.join(root, "config"),
  XDG_DATA_HOME: path.join(root, "data"),
  XDG_CACHE_HOME: path.join(root, "cache"),
}
const start = (binary: string, file = shared) =>
  Service.ensure({
    file,
    command: [binary, "serve", "--service", "--port", "0"],
    env: {
      ...env,
      ...(file === isolated
        ? { XDG_STATE_HOME: path.join(root, "isolated"), OPENCODE_DB: path.join(root, "isolated.db") }
        : {}),
    },
  })
const connect = () =>
  connectBocService({
    version,
    mode: "initial",
    discoverShared: () => Service.discover({ file: shared }),
    discoverIsolated: () => Service.discover({ file: isolated }),
    inspect: (endpoint) => inspectBocService(endpoint, project, Service.headers(endpoint)),
    ensureShared: () => start(boc),
    ensureIsolated: () => start(boc, isolated),
    stopShared: () => Service.stop({ file: shared, pty: "handoff" }),
  })
const rpc = async (endpoint: Awaited<ReturnType<typeof start>>, method: string, input = {}) => {
  const url = new URL(`/api/rpc/bergflow.control.v1/${method}`, endpoint.url)
  url.searchParams.set("location[directory]", project)
  const response = await fetch(url, {
    method: "POST",
    headers: { ...Service.headers(endpoint), "content-type": "application/json" },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(20000),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result.output
}
try {
  await mkdir(project, { recursive: true })
  await Bun.write(
    path.join(project, ".opencode/skills/check/SKILL.md"),
    "---\nname: check\ndescription: Lifecycle fixture\n---\nFixture.\n",
  )
  await Bun.write(config, JSON.stringify({ plugins: [plugin] }))
  const first = await start(official)
  const before = await rpc(first, "getState")
  const skill = before.items.find((item: { kind: string }) => item.kind === "skill")
  assert.ok(skill)
  await rpc(first, "setEnabled", { kind: "skill", id: skill.id, enabled: false, expectedRevision: 0 })
  // Keep the same project/database while changing only the delivery source.
  await Bun.write(config, JSON.stringify({ plugins: [] }))
  const replacement = await connect()
  assert.notEqual(replacement.url, first.url)
  const after = await rpc(replacement, "getState")
  assert.equal(after.info.source, "bundled")
  assert.equal(after.revision, 1)
  assert.equal(after.items.find((item: { id: string }) => item.id === skill.id).override, false)
  assert.equal(after.items.find((item: { id: string }) => item.id === skill.id).effective, "disabled")
  const cliAfter = await Service.ensure({
    file: shared,
    version,
    command: [official, "serve", "--service", "--port", "0"],
    env,
  })
  assert.equal(cliAfter.url, replacement.url)
  console.log(
    "PASS CLI first -> Boc replacement -> original CLI shares service; policy survives external-to-bundle switch",
  )
  await Service.stop({ file: shared })
  const bocFirst = await connect()
  const originalAfter = await Service.ensure({
    file: shared,
    version,
    command: [official, "serve", "--service", "--port", "0"],
    env,
  })
  assert.equal(originalAfter.url, bocFirst.url)
  console.log("PASS Boc first -> original CLI shares service")
  await Service.stop({ file: shared })
  const incompatible = await start(newer)
  const fallback = await connect()
  assert.notEqual(fallback.url, incompatible.url)
  assert.equal((await Service.discover({ file: shared }))?.url, incompatible.url)
  assert.equal((await rpc(fallback, "info")).source, "bundled")
  const same = await connect()
  assert.equal(same.url, fallback.url)
  console.log("PASS incompatible original stays running; isolated Boc fallback reused")
} finally {
  await Promise.allSettled([Service.stop({ file: shared }), Service.stop({ file: isolated })])
  await rm(root, { recursive: true, force: true })
}
