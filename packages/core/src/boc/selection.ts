export * as BocSelection from "./selection.js"

import path from "path"
import { Context, Effect, Layer, Scope } from "effect"
import { makeLocationNode } from "@opencode-ai/util/effect/app-node"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Global } from "@opencode-ai/util/global"
import type { InstructionDiscovery } from "../instruction-discovery.js"
import { Location } from "../location.js"

export interface Candidate {
  readonly id: string
  readonly path: string
  readonly source: "project" | "global" | "unknown"
}

export interface Selection {
  readonly candidates: ReadonlyArray<Candidate>
  readonly exclude: (id: string) => void
}

type Selector = (selection: Selection) => void

export interface Interface {
  readonly select: (files: InstructionDiscovery.File[]) => Effect.Effect<InstructionDiscovery.File[]>
  readonly register: (
    selector: Selector,
  ) => Effect.Effect<void, never, Scope.Scope | FSUtil.Service | Global.Service | Location.Service>
}

export class Service extends Context.Service<Service, Interface>()("@boc/InstructionSelection") {}

export const layer = Layer.sync(
  Service,
  () => {
    const selectors = new Set<(files: InstructionDiscovery.File[]) => Effect.Effect<Set<string>>>()

    return Service.of({
      register: Effect.fn("BocSelection.register")(function* (selector) {
        const fs = yield* FSUtil.Service
        const global = yield* Global.Service
        const location = yield* Location.Service
        const select = Effect.fn("BocSelection.classify")(function* (files: InstructionDiscovery.File[]) {
          const checkout = yield* fs.resolve(location.project.directory)
          const globalFile = yield* fs.resolve(path.join(global.config, "AGENTS.md"))
          const resolved = yield* Effect.forEach(files, (file) =>
            fs.resolve(file.path).pipe(Effect.map((canonical) => ({ file, canonical }))),
          )
          const projectIDs = resolved.map((item) =>
            FSUtil.contains(checkout, item.canonical)
              ? path.relative(checkout, item.canonical).split(path.sep).join("/")
              : undefined,
          )
          const duplicates = new Set(
            projectIDs.filter(
              (id): id is string => id !== undefined && projectIDs.indexOf(id) !== projectIDs.lastIndexOf(id),
            ),
          )
          const candidates = resolved.map((item, index): Candidate => {
            if (item.canonical === globalFile) return { id: item.file.path, path: item.file.path, source: "global" }
            const id = projectIDs[index]
            if (id !== undefined && !duplicates.has(id)) return { id, path: item.file.path, source: "project" }
            return { id: item.file.path, path: item.file.path, source: "unknown" }
          })
          const paths = new Map(candidates.map((candidate) => [candidate.id, candidate.path]))
          const excluded = new Set<string>()
          selector({
            candidates,
            exclude: (id) => {
              const candidate = paths.get(id)
              if (candidate === undefined) throw new Error(`Unknown instruction selection ID: ${id}`)
              excluded.add(candidate)
            },
          })
          return excluded
        })
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            selectors.add(select)
          }),
          () =>
            Effect.sync(() => {
              selectors.delete(select)
            }),
        )
      }),
      select: Effect.fn("BocSelection.select")(function* (files) {
        if (!selectors.size) return files
        const excluded = yield* Effect.forEach(selectors, (select) => select(files))
        return files.filter((file) => !excluded.some((paths) => paths.has(file.path)))
      }),
    })
  },
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
