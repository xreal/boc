export * as BocSelection from "./selection.js"

import path from "path"
import type { EffectDomain } from "@opencode-ai/plugin/boc/selection"
import { Effect } from "effect"
import { FSUtil } from "@opencode-ai/util/fs-util"
import type { Global } from "@opencode-ai/util/global"
import type { InstructionDiscovery } from "../instruction-discovery.js"
import type { Location } from "../location.js"
import type { PluginHooks } from "../plugin/hooks.js"
import type { AbsolutePath } from "../schema.js"

export interface Hooks {
  readonly instructions: {
    readonly paths: ReadonlyArray<AbsolutePath>
    readonly exclude: (path: AbsolutePath) => void
  }
}

export function instructions(hooks: PluginHooks.Interface, files: ReadonlyArray<InstructionDiscovery.File>) {
  return Effect.gen(function* () {
    const known = new Set(files.map((file) => file.path))
    const excluded = new Set<AbsolutePath>()
    yield* hooks.trigger("selection", "instructions", {
      paths: files.map((file) => file.path),
      exclude: (candidate) => {
        if (!known.has(candidate)) throw new Error(`Unknown instruction selection path: ${candidate}`)
        excluded.add(candidate)
      },
    })
    return files.filter((file) => !excluded.has(file.path))
  })
}

export function facade(input: {
  readonly hooks: PluginHooks.Interface
  readonly discovery: InstructionDiscovery.Interface
  readonly fs: FSUtil.Interface
  readonly global: Global.Interface
  readonly location: Location.Interface
}): EffectDomain {
  const describe = (paths: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      const checkout = yield* input.fs.resolve(input.location.project.directory)
      const global = yield* input.fs.resolve(path.join(input.global.config, "AGENTS.md"))
      const resolved = yield* Effect.forEach(paths, (native) =>
        input.fs.resolve(native).pipe(Effect.map((canonical) => ({ native, canonical }))),
      )
      const projectIDs = resolved.map((file) =>
        FSUtil.contains(checkout, file.canonical) ? normalize(path.relative(checkout, file.canonical)) : undefined,
      )
      const duplicates = new Set(
        projectIDs.filter(
          (id): id is string => id !== undefined && projectIDs.indexOf(id) !== projectIDs.lastIndexOf(id),
        ),
      )
      return resolved.map((file, index) => {
        if (file.canonical === global) return { id: file.native, path: file.native, source: "global" as const }
        const id = projectIDs[index]
        if (id !== undefined && !duplicates.has(id)) return { id, path: file.native, source: "project" as const }
        return { id: file.native, path: file.native, source: "unknown" as const }
      })
    })

  return {
    version: 1,
    hook: (_name, callback) =>
      input.hooks.register("selection", "instructions", (event) =>
        Effect.gen(function* () {
          const candidates = yield* describe(event.paths)
          const paths = new Map(candidates.map((candidate, index) => [candidate.id, event.paths[index]!]))
          yield* callback({
            candidates,
            exclude: (id) => {
              const candidate = paths.get(id)
              if (candidate === undefined) throw new Error(`Unknown instruction selection ID: ${id}`)
              event.exclude(candidate)
            },
          })
        }),
      ),
    listInstructions: Effect.fn("PluginSelection.listInstructions")(function* () {
      const files = yield* input.discovery.list()
      if (!Array.isArray(files)) return { available: false, sources: [] }
      return { available: true, sources: yield* describe(files.map((file) => file.path)) }
    }),
  }
}

function normalize(value: string) {
  return value.split(path.sep).join("/")
}
