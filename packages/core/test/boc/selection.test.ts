import { expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { InstructionDiscovery } from "@opencode-ai/core/instruction-discovery"
import { BocSelection } from "@opencode-ai/core/boc/selection"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Global } from "@opencode-ai/util/global"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Effect, Layer } from "effect"
import { tempLocationLayer } from "../fixture/location"
import { tempGlobalLayer } from "../fixture/global"
import { readInitial } from "../lib/instructions"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([InstructionDiscovery.node, BocSelection.node, Global.node, Location.node, FSUtil.node]),
    [Location.node.replace(tempLocationLayer), Global.node.replace(tempGlobalLayer)],
  ),
)

it.effect("retains disabled inventory and scopes native selection to its registration", () =>
  Effect.gen(function* () {
    const discovery = yield* InstructionDiscovery.Service
    const selection = yield* BocSelection.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const globalFile = path.join(global.config, "AGENTS.md")
    const projectFile = path.join(location.project.directory, "AGENTS.md")
    const packageFile = path.join(location.project.directory, "packages", "AGENTS.md")
    const outsideFile = path.join(path.dirname(location.project.directory), "AGENTS.md")
    const observed: string[][] = []
    let disabled = true
    yield* discovery.transform((editor) => {
      editor.add(file(globalFile, "global"))
      editor.add(file(projectFile, "project"))
      editor.add(file(packageFile, "package"))
      editor.add(file(outsideFile, "outside"))
    })
    yield* Effect.gen(function* () {
      yield* selection.register((event) => {
        observed.push(event.candidates.map((candidate) => `${candidate.source}:${candidate.id}`))
        event.candidates
          .filter((candidate) => disabled && candidate.source === "project" && candidate.id === "AGENTS.md")
          .forEach((candidate) => event.exclude(candidate.id))
      })
      expect((yield* readInitial(yield* discovery.load())).text).toBe(
        [
          `Instructions from: ${globalFile}\nglobal`,
          `Instructions from: ${packageFile}\npackage`,
          `Instructions from: ${outsideFile}\noutside`,
        ].join("\n\n"),
      )
      expect(observed[0]).toEqual([
        `global:${globalFile}`,
        "project:AGENTS.md",
        "project:packages/AGENTS.md",
        `unknown:${outsideFile}`,
      ])
      yield* discovery.transform((editor) =>
        editor.update(projectFile, (current) => {
          current.content = "updated while disabled"
        }),
      )
      disabled = false
      expect((yield* readInitial(yield* discovery.load())).text).toContain(
        `Instructions from: ${projectFile}\nupdated while disabled`,
      )
      disabled = true
    }).pipe(Effect.scoped)

    const observedBeforeDisposal = observed.length
    expect((yield* readInitial(yield* discovery.load())).text).toContain(`Instructions from: ${projectFile}\nproject`)
    expect(observed).toHaveLength(observedBeforeDisposal)
    yield* discovery.transform((editor) => editor.unavailable())
    expect(Array.isArray(yield* discovery.list())).toBe(false)
  }),
)

it.live("keeps canonical aliases and global files read-only and isolates selection instances", () =>
  Effect.gen(function* () {
    const selection = yield* BocSelection.Service
    const location = yield* Location.Service
    const global = yield* Global.Service
    const projectFile = path.join(location.project.directory, "AGENTS.md")
    const alias = path.join(location.project.directory, "alias.md")
    const globalFile = path.join(global.config, "AGENTS.md")
    const globalAlias = path.join(location.project.directory, "global.md")
    yield* Effect.promise(async () => {
      await fs.mkdir(global.config, { recursive: true })
      await Bun.write(projectFile, "project")
      await Bun.write(globalFile, "global")
      await fs.symlink(projectFile, alias)
      await fs.symlink(globalFile, globalAlias)
    })
    const files = [projectFile, alias, globalAlias].map((path) => file(path, path))
    const observed: BocSelection.Candidate[] = []
    yield* selection.register((event) => {
      observed.push(...event.candidates)
      event.candidates
        .filter((candidate) => candidate.source === "project")
        .forEach((candidate) => event.exclude(candidate.id))
    })
    expect(yield* selection.select(files)).toEqual(files)
    expect(observed.map((candidate) => candidate.source)).toEqual(["unknown", "unknown", "global"])
    yield* selection.register((event) => event.exclude(projectFile))
    expect(yield* selection.select(files)).toEqual(files.slice(1))
    // A second Location service instance does not inherit this Location's registrations.
    expect(
      yield* Effect.gen(function* () {
        const other = yield* BocSelection.Service
        return yield* other.select(files)
      }).pipe(Effect.provide(Layer.fresh(BocSelection.layer))),
    ).toEqual(files)
  }),
)

function file(path: string, content: string) {
  return new InstructionDiscovery.File({ path: AbsolutePath.make(path), content })
}
