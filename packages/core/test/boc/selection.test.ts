import { expect } from "bun:test"
import path from "path"
import { InstructionDiscovery } from "@opencode-ai/core/instruction-discovery"
import { Location } from "@opencode-ai/core/location"
import { Plugin } from "@opencode-ai/core/plugin"
import { AbsolutePath } from "@opencode-ai/core/schema"
import type { InstructionInventory } from "@opencode-ai/plugin/boc/selection"
import { fromPromise } from "@opencode-ai/plugin/promise/adapter"
import { Global } from "@opencode-ai/util/global"
import { Effect } from "effect"
import { readInitial } from "../lib/instructions"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

const it = testEffect(PluginTestLayer)

it.effect("selects ambient project instructions through the optional Promise facade", () =>
  Effect.gen(function* () {
    const discovery = yield* InstructionDiscovery.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const plugins = yield* Plugin.Service
    const globalFile = path.join(global.config, "AGENTS.md")
    const projectFile = path.join(location.project.directory, "AGENTS.md")
    const packageFile = path.join(location.project.directory, "packages", "AGENTS.md")
    const outsideFile = path.join(path.dirname(location.project.directory), "AGENTS.md")
    const observed: string[][] = []
    let disabled = true
    let listInstructions: (() => Promise<InstructionInventory>) | undefined
    yield* discovery.transform((editor) => {
      editor.add(file(globalFile, "global"))
      editor.add(file(projectFile, "project"))
      editor.add(file(packageFile, "package"))
      editor.add(file(outsideFile, "outside"))
    })
    yield* plugins.activate([
      {
        ...fromPromise({
          id: "selection",
          async setup(ctx) {
            if (ctx.selection?.version !== 1) throw new Error("selection unavailable")
            listInstructions = ctx.selection.listInstructions
            await ctx.selection.hook("instructions", (event) => {
              observed.push(event.candidates.map((candidate) => `${candidate.source}:${candidate.id}`))
              event.candidates
                .filter((candidate) => disabled && candidate.source === "project" && candidate.id === "AGENTS.md")
                .forEach((candidate) => event.exclude(candidate.id))
            })
          },
        }),
        revision: "1",
      },
    ])

    if (!listInstructions) return yield* Effect.die("listInstructions unavailable")
    const inventory = yield* Effect.promise(listInstructions)
    expect(inventory).toEqual({
      available: true,
      sources: [
        { id: globalFile, path: globalFile, source: "global" },
        { id: "packages/AGENTS.md", path: packageFile, source: "project" },
        { id: outsideFile, path: outsideFile, source: "unknown" },
      ],
    })
    expect(observed[0]).toEqual([
      `global:${globalFile}`,
      "project:AGENTS.md",
      "project:packages/AGENTS.md",
      `unknown:${outsideFile}`,
    ])
    expect((yield* readInitial(yield* discovery.load())).text).toBe(
      [
        `Instructions from: ${globalFile}\nglobal`,
        `Instructions from: ${packageFile}\npackage`,
        `Instructions from: ${outsideFile}\noutside`,
      ].join("\n\n"),
    )

    yield* discovery.transform((editor) =>
      editor.update(projectFile, (current) => {
        current.content = "updated while disabled"
      }),
    )
    disabled = false
    expect((yield* readInitial(yield* discovery.load())).text).toContain(
      `Instructions from: ${projectFile}\nupdated while disabled`,
    )

    yield* plugins.activate([])
    const observedBeforeDisposal = observed.length
    yield* discovery.load()
    expect(observed).toHaveLength(observedBeforeDisposal)

    yield* discovery.transform((editor) => editor.unavailable())
    expect(yield* Effect.promise(listInstructions)).toEqual({ available: false, sources: [] })
  }),
)

function file(path: string, content: string) {
  return new InstructionDiscovery.File({ path: AbsolutePath.make(path), content })
}
