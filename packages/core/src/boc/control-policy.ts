export * as BocControlPolicy from "./control-policy.js"

import { BocControls } from "@opencode-ai/schema/boc/controls"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { KV } from "../kv.js"

export type Member = { apply: (kind: BocControls.Kind) => Effect.Effect<void>; changed: () => Effect.Effect<void> }
export type Project = { policy: BocControls.Policy; members: Set<Member> }
export class Service extends Context.Service<
  Service,
  {
    project: (id: string) => Effect.Effect<Project>
    save: (id: string, project: Project, policy: BocControls.Policy) => Effect.Effect<void>
    lock: Semaphore.Semaphore
  }
>()("boc/ControlPolicy") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const kv = yield* KV.Service
    const projects = new Map<string, Project>()
    const lock = Semaphore.makeUnsafe(1)
    return Service.of({
      lock,
      project: (id) =>
        lock.withPermits(1)(
          Effect.gen(function* () {
            const existing = projects.get(id)
            if (existing) return existing
            const saved = (yield* kv.get(controlsKey(id))) ?? (yield* kv.get(bergflowKey(id, "policy")))
            const settings = saved === undefined ? yield* kv.get(bergflowKey(id, "settings")) : undefined
            const policy = yield* Schema.decodeUnknownEffect(BocControls.Policy)(
              saved ?? {
                revision: 0,
                settings: settings ?? { agent: {}, skill: {}, tool: {}, mcp: {}, instruction: {} },
              },
            ).pipe(Effect.orDie)
            // Commit migration before publishing the shared policy. Keep the legacy
            // value intact so an older installation can still read its settings.
            yield* kv.set(controlsKey(id), policy)
            const project: Project = { policy, members: new Set() }
            projects.set(id, project)
            return project
          }),
        ),
      save: (id, project, policy) =>
        kv.set(controlsKey(id), policy).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              project.policy = policy
            }),
          ),
        ),
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

function bergflowKey(project: string, record: "policy" | "settings") {
  const plugin = Array.from("bergflow", (char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join("")
  return `plugin:${plugin}:control/${record}/${project}`
}
