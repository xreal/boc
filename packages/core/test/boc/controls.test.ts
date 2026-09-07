import { expect } from "bun:test"
import { BocControls } from "@opencode-ai/schema/boc/controls"
import { BocProjectControls } from "@opencode-ai/core/boc/controls"
import { BocControlPolicy } from "@opencode-ai/core/boc/control-policy"
import { BocControlSource } from "@opencode-ai/core/boc/control-source"
import { Config } from "@opencode-ai/core/config"
import { Global } from "@opencode-ai/util/global"
import { Plugin } from "@opencode-ai/core/plugin"
import { KV } from "@opencode-ai/core/kv"
import { Location } from "@opencode-ai/core/location"
import { InstructionDiscovery } from "@opencode-ai/core/instruction-discovery"
import { Rpc } from "@opencode-ai/core/rpc"
import { Skill } from "@opencode-ai/core/skill"
import { Tool } from "@opencode-ai/core/tool"
import { Effect, Schema } from "effect"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { tempLocationLayer } from "../fixture/location"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Plugin.node,
      Config.node,
      BocControlPolicy.node,
      Tool.node,
      Skill.node,
      Rpc.node,
      Location.node,
      Global.node,
      KV.node,
      InstructionDiscovery.node,
    ]),
    [Location.node.replace(tempLocationLayer), Config.node.replace(Config.testLayer())],
  ),
)

it.effect("native controls enforce saved tools and skills, retain source and reject stale revisions", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const rpc = yield* Rpc.Service
    const skills = yield* Skill.Service
    const tools = yield* Tool.Service
    const discovery = yield* InstructionDiscovery.Service
    const location = yield* Location.Service
    const global = yield* Global.Service
    yield* discovery.transform((editor) => {
      editor.add(
        new InstructionDiscovery.File({
          path: AbsolutePath.make(`${location.project.directory}/AGENTS.md`),
          content: "Project guidance",
        }),
      )
      editor.add(
        new InstructionDiscovery.File({
          path: AbsolutePath.make(`${global.config}/AGENTS.md`),
          content: "Global guidance",
        }),
      )
    })
    const services = yield* Effect.context<Config.Service | Global.Service | Tool.Service | BocControlPolicy.Service>()
    yield* plugins.activate([
      {
        id: "native-fixture",
        revision: "1",
        source: { type: "builtin" },
        effect: (host) =>
          Effect.gen(function* () {
            const ctx = BocControlSource.remember(host, "native-fixture")
            yield* ctx.tool.transform((editor) =>
              editor.add({
                name: "sample",
                description: "sample",
                input: Schema.Struct({}),
                output: Schema.Struct({}),
                execute: () => Effect.succeed({ output: {}, content: [] }),
              }),
            )
            yield* ctx.skill.transform((editor) =>
              editor.add({
                id: Skill.ID.make("guide"),
                name: Skill.Name.make("Guide"),
                description: "",
                location: AbsolutePath.make("/builtin/guide.md"),
                content: "Guide",
              }),
            )
          }),
      },
      {
        id: BocProjectControls.Definition.id,
        revision: "1",
        effect: (ctx) =>
          BocProjectControls.Definition.effect({ ...ctx, app: { ...ctx.app, channel: "boc" } }).pipe(
            Effect.provide(services),
          ),
      },
    ])
    expect(yield* plugins.list()).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "boc.project-controls", state: { status: "active" } })]),
    )
    const client = rpc.client(BocControls.Rpc)
    const initial = yield* client.getState({})
    expect(initial.items.find((item) => item.id === "sample")?.origin).toBe("system")
    expect(initial.items.find((item) => item.id === "guide")?.origin).toBe("system")
    const disabled = yield* client.setEnabled({ kind: "skill", id: "guide", enabled: false, expectedRevision: 0 })
    expect(disabled.revision).toBe(1)
    expect(disabled.items.find((item) => item.id === "guide")?.effective).toBe("disabled")
    expect(yield* skills.get(Skill.ID.make("guide"))).toBeUndefined()
    const stale = yield* client
      .setEnabled({ kind: "tool", id: "sample", enabled: false, expectedRevision: 0 })
      .pipe(Effect.flip)
    expect(stale).toMatchObject({ type: "conflict" })
    yield* client.setEnabled({ kind: "tool", id: "sample", enabled: false, expectedRevision: 1 })
    yield* tools.reload()
    const after = yield* client.getState({})
    expect(after.items.find((item) => item.id === "sample")?.effective).toBe("disabled")
    expect(after.items.find((item) => item.id === "sample")?.origin).toBe("system")
    yield* client.clearOverride({ kind: "skill", id: "guide", expectedRevision: 2 })
    expect(yield* skills.get(Skill.ID.make("guide"))).toBeDefined()
    const instruction = yield* client.setEnabled({
      kind: "instruction",
      id: "AGENTS.md",
      enabled: false,
      expectedRevision: 3,
    })
    expect(instruction.items.find((item) => item.id === "AGENTS.md")?.origin).toBe("project")
    const files = yield* discovery.list()
    expect(Array.isArray(files) && files.some((file) => file.path === `${location.project.directory}/AGENTS.md`)).toBe(
      false,
    )
    expect(instruction.items.find((item) => item.source === `${global.config}/AGENTS.md`)?.mutable).toBe(false)
  }),
)

it.effect("migrates legacy policy once without losing overrides", () =>
  Effect.gen(function* () {
    const kv = yield* KV.Service
    const policies = yield* BocControlPolicy.Service
    const location = yield* Location.Service
    const key = `plugin:${Array.from("bergflow", (char) => char.charCodeAt(0).toString(16).padStart(4, "0")).join("")}:control/policy/${location.project.id}`
    const saved = {
      revision: 7,
      settings: { agent: {}, tool: { read: false }, skill: {}, mcp: {}, instruction: { "AGENTS.md": false } },
    }
    yield* kv.set(key, saved)
    const project = yield* policies.project(location.project.id)
    expect(project.policy).toEqual(saved)
    expect(yield* kv.get(`boc:controls:${location.project.id}`)).toEqual(saved)
    expect(yield* kv.get(key)).toEqual(saved)
    const again = yield* policies.project(location.project.id)
    expect(again).toBe(project)
  }),
)
