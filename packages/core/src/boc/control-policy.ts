export * as BocControlPolicy from "./control-policy.js"

import { BocControls } from "@opencode/schema/boc/controls"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { KV } from "../kv.js"

export type Member = { apply: (kind: BocControls.Kind) => Effect.Effect<void>; changed: () => Effect.Effect<void> }
export type Project = { policy: BocControls.Policy; members: Set<Member> }
export class Service extends Context.Service<
  Service,
  {
    project: (id: string) => Effect.Effect<Project>
    save: (id: string, project: Project, policy: BocControls.Policy) => Effect.Effect<void>
    global: () => Effect.Effect<Project>
    saveGlobal: (global: Project, policy: BocControls.Policy) => Effect.Effect<void>
    lock: Semaphore.Semaphore
  }
>()("boc/ControlPolicy") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const kv = yield* KV.Service
    const records = new Map<string, Project>()
    const lock = Semaphore.makeUnsafe(1)
    const load = Effect.fn("BocControlPolicy.load")(function* (
      records: Map<string, Project>,
      key: string,
      legacy?: { policy: string; settings: string },
    ) {
      const existing = records.get(key)
      if (existing) return existing
      const saved = (yield* kv.get(key)) ?? (legacy ? yield* kv.get(legacy.policy) : undefined)
      const settings = saved === undefined && legacy ? yield* kv.get(legacy.settings) : undefined
      const policy = yield* Schema.decodeUnknownEffect(BocControls.Policy)(
        saved ?? {
          revision: 0,
          settings: settings ?? { agent: {}, skill: {}, tool: {}, mcp: {}, instruction: {} },
        },
      ).pipe(Effect.orDie)
      // Project records may come from legacy keys. Materialize the Boc record without deleting
      // the legacy value so older installations can still read their settings.
      yield* kv.set(key, policy)
      const record: Project = { policy, members: new Set() }
      records.set(key, record)
      return record
    })
    const save = (key: string, record: Project, policy: BocControls.Policy) =>
      kv.set(key, policy).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            record.policy = policy
          }),
        ),
      )
    return Service.of({
      lock,
      project: (id) =>
        lock.withPermits(1)(
          load(records, controlsKey(id), {
            policy: bergflowKey(id, "policy"),
            settings: bergflowKey(id, "settings"),
          }),
        ),
      save: (id, project, policy) => save(controlsKey(id), project, policy),
      global: () => lock.withPermits(1)(load(records, globalControlsKey)),
      saveGlobal: (global, policy) => save(globalControlsKey, global, policy),
    })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [KV.node],
})

function controlsKey(project: string) {
  return `boc:controls:${project}`
}

const globalControlsKey = "boc:controls:global-defaults"

function bergflowKey(project: string, record: "policy" | "settings") {
  const plugin = Array.from("bergflow", (char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join("")
  return `plugin:${plugin}:control/${record}/${project}`
}
