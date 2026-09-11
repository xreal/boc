import { expect } from "bun:test"
import fs from "fs/promises"
import { BocControls } from "@opencode/schema/boc/controls"
import { Document, Info } from "@opencode/schema/config"
import { BocProjectControls } from "@opencode/core/boc/controls"
import { BocControlPolicy } from "@opencode/core/boc/control-policy"
import { BocControlSource } from "@opencode/core/boc/control-source"
import { BocSelection } from "@opencode/core/boc/selection"
import { Config } from "@opencode/core/config"
import { ConfigAgentPlugin } from "@opencode/core/config/plugin/agent"
import { ConfigMcpPlugin } from "@opencode/core/config/plugin/mcp"
import { ConfigSkillPlugin } from "@opencode/core/config/plugin/skill"
import { Global } from "@opencode/util/global"
import { FSUtil } from "@opencode/util/fs-util"
import { Plugin } from "@opencode/core/plugin"
import { KV } from "@opencode/core/kv"
import { Location } from "@opencode/core/location"
import { InstructionDiscovery } from "@opencode/core/instruction-discovery"
import { Rpc } from "@opencode/core/rpc"
import { Skill } from "@opencode/core/skill"
import { SkillDiscovery } from "@opencode/core/skill/discovery"
import { Tool } from "@opencode/core/tool"
import { Mcp } from "@opencode/core/mcp/index"
import { Watcher } from "@opencode/core/filesystem/watcher"
import { Effect, Layer, Schema } from "effect"
import path from "path"
import { parse } from "jsonc-parser"
import { Agent } from "@opencode/core/agent"
import { Credential } from "@opencode/core/credential"
import { AbsolutePath } from "@opencode/core/schema"
import { WellKnown } from "@opencode/core/wellknown"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { location, tempLocationLayer } from "../fixture/location"
import { emptyCredentialNode, emptyWellknownNode } from "../fixture/config-nodes"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Plugin.node,
      Config.node,
      BocControlPolicy.node,
      BocSelection.node,
      FSUtil.node,
      Tool.node,
      Skill.node,
      Rpc.node,
      Location.node,
      Global.node,
      KV.node,
      InstructionDiscovery.node,
    ]),
    [
      Location.node.replace(tempLocationLayer),
      Config.node.replace(
        Config.testLayer([
          new Document({
            type: "document",
            path: AbsolutePath.make("/config/opencode.jsonc"),
            info: Schema.decodeUnknownSync(Info)({
              agents: { writer: { description: "Inherited writer", disabled: true } },
            }),
          }),
        ]),
      ),
    ],
  ),
)

const live = testEffect(Layer.empty)

it.effect("native controls enforce saved tools and skills, retain source and reject stale revisions", () =>
  Effect.gen(function* () {
    const plugins = yield* Plugin.Service
    const rpc = yield* Rpc.Service
    const skills = yield* Skill.Service
    const tools = yield* Tool.Service
    const discovery = yield* InstructionDiscovery.Service
    const location = yield* Location.Service
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    const globalConfig = `${global.config}/opencode.jsonc`
    const legacyGlobalSkill = path.join(global.home, ".opencode", "skills", "legacy-global", "SKILL.md")
    const globalContent =
      '// global configuration\n{\n  "mcp": {\n    "servers": {\n      "remote": {\n        "type": "remote",\n        "url": "https://example.test/mcp",\n        "headers": { "Authorization": "Bearer {env:MCP_TOKEN}" },\n        "oauth": { "client_id": "client" }\n      }\n    }\n  }\n}\n'
    yield* fs.writeWithDirs(globalConfig, globalContent)
    yield* fs.writeWithDirs(legacyGlobalSkill, "---\nname: Legacy global\n---\nLegacy skill\n")
    const removableSkill = `${location.project.directory}/.opencode/skill/removable/SKILL.md`
    yield* fs.writeWithDirs(removableSkill, "---\nname: Removable\n---\nTemporary skill\n")
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
    const services = yield* Effect.context<
      | Config.Service
      | Global.Service
      | Tool.Service
      | BocControlPolicy.Service
      | BocSelection.Service
      | InstructionDiscovery.Service
      | FSUtil.Service
      | Location.Service
    >()
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
            yield* ctx.skill.transform((editor) =>
              editor.add({
                id: Skill.ID.make("removable"),
                name: Skill.Name.make("Removable"),
                description: "",
                location: AbsolutePath.make(removableSkill),
                content: "Temporary skill",
              }),
            )
            yield* ctx.skill.transform((editor) =>
              editor.add({
                id: Skill.ID.make("legacy-global"),
                name: Skill.Name.make("Legacy global"),
                description: "",
                location: AbsolutePath.make(legacyGlobalSkill),
                content: "Legacy skill",
              }),
            )
            yield* ctx.mcp.transform((editor) => {
              editor.set("remote", {
                type: "remote",
                url: "https://example.test/mcp",
                headers: { Authorization: "Bearer {env:MCP_TOKEN}" },
                oauth: { client_id: "client" },
              })
              BocControlSource.file(editor.get("remote"), globalConfig)
            })
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
    const configuration = yield* client.getConfiguration({ scope: "project" })
    const savedConfiguration = yield* client.saveConfiguration({
      scope: "project",
      expectedRevision: configuration.revision,
      content: '// Retain this comment\n{\n  "agents": { "builder": { "disabled": true } }\n}\n',
    })
    expect(savedConfiguration.content).toContain("// Retain this comment")
    const staleConfiguration = yield* client
      .saveConfiguration({ scope: "project", expectedRevision: configuration.revision, content: "{}\n" })
      .pipe(Effect.flip)
    expect(staleConfiguration).toMatchObject({ type: "conflict" })
    const instructionSource = yield* client.createSource({
      kind: "instruction",
      scope: "project",
      name: "AGENTS.md",
      content: "Initial guidance\n",
    })
    const savedSource = yield* client.saveSource({
      kind: "instruction",
      id: instructionSource.id,
      expectedRevision: instructionSource.revision,
      content: "Updated guidance\n",
    })
    expect(savedSource.content).toBe("Updated guidance\n")
    const staleSource = yield* client
      .saveSource({
        kind: "instruction",
        id: instructionSource.id,
        expectedRevision: instructionSource.revision,
        content: "Stale guidance\n",
      })
      .pipe(Effect.flip)
    expect(staleSource).toMatchObject({ type: "conflict" })
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
    const legacy = yield* client.getSource({ kind: "skill", id: "legacy-global" })
    expect(legacy.scope).toBe("global")
    const savedLegacy = yield* client.saveSource({
      kind: "skill",
      id: "legacy-global",
      expectedRevision: legacy.revision,
      content: "---\nname: Legacy global\n---\nUpdated legacy skill\n",
    })
    expect(savedLegacy.content).toContain("Updated legacy skill")
    const removable = yield* client.getSource({ kind: "skill", id: "removable" })
    yield* client.deleteSource({ kind: "skill", id: "removable", expectedRevision: removable.revision })
    expect(yield* fs.existsSafe(removable.path)).toBe(false)
    yield* client.setEnabled({ kind: "mcp", id: "remote", enabled: false, expectedRevision: 4 })
    yield* client.setEnabled({ kind: "mcp", id: "remote", enabled: true, expectedRevision: 5 })
    const projectConfig = yield* fs.readFileString(path.join(location.directory, ".opencode", "opencode.jsonc"))
    const projectSettings = parse(projectConfig)
    expect(projectConfig).toContain('"Authorization"')
    expect(projectConfig).toContain('"client_id"')
    expect(projectSettings.mcp.servers.remote).toMatchObject({
      disabled: false,
      headers: { Authorization: "Bearer {env:MCP_TOKEN}" },
      oauth: { client_id: "client" },
    })
    expect(yield* fs.readFileString(globalConfig)).toBe(globalContent)
  }).pipe(Effect.orDie),
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

live.live("controls apply native configuration through real config plugins and file watches", () =>
  Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
    Effect.flatMap((tmp) => {
      const project = path.join(tmp.path, "project")
      const global = path.join(tmp.path, "global")
      const globalConfig = path.join(global, "opencode.jsonc")
      const projectConfig = path.join(project, ".opencode", "opencode.jsonc")
      return Effect.promise(async () => {
        await fs.mkdir(global, { recursive: true })
        await fs.mkdir(path.dirname(projectConfig), { recursive: true })
        await Bun.write(path.join(global, "writer.txt"), "Global prompt")
        await Bun.write(
          globalConfig,
          JSON.stringify({
            agents: {
              writer: { model: "example/global", system: `{file:${path.join(global, "writer.txt")}}` },
            },
            mcp: {
              servers: {
                remote: {
                  type: "remote",
                  url: "https://example.test/mcp",
                  headers: { Authorization: "Bearer {env:HOME}" },
                },
              },
            },
          }),
        )
        await Bun.write(
          projectConfig,
          JSON.stringify({
            agents: {
              builder: { model: "example/project", system: "Project prompt" },
            },
          }),
        )
      }).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const plugins = yield* Plugin.Service
            const rpc = yield* Rpc.Service
            const agents = yield* Agent.Service
            const config = yield* Config.Service
            expect(
              (yield* config.entries()).filter((entry) => entry.type === "document").map((entry) => entry.path),
            ).toEqual(expect.arrayContaining([globalConfig, projectConfig]))
            const services = yield* Effect.context<
              | BocControlPolicy.Service
              | BocSelection.Service
              | Config.Service
              | FSUtil.Service
              | Global.Service
              | InstructionDiscovery.Service
              | Location.Service
              | Mcp.Service
              | SkillDiscovery.Service
              | Tool.Service
              | Watcher.Service
            >()
            yield* plugins.activate([
              {
                ...ConfigAgentPlugin.Plugin,
                revision: "1",
                source: { type: "builtin" },
                effect: (ctx) => ConfigAgentPlugin.Plugin.effect(ctx).pipe(Effect.provide(services)),
              },
              {
                ...ConfigMcpPlugin.Plugin,
                revision: "1",
                source: { type: "builtin" },
                effect: (ctx) => ConfigMcpPlugin.Plugin.effect(ctx).pipe(Effect.provide(services)),
              },
              {
                ...ConfigSkillPlugin.Plugin,
                revision: "1",
                source: { type: "builtin" },
                effect: (ctx) => ConfigSkillPlugin.Plugin.effect(ctx).pipe(Effect.provide(services)),
              },
              {
                id: BocProjectControls.Definition.id,
                revision: "1",
                source: { type: "builtin" },
                effect: (ctx) =>
                  BocProjectControls.Definition.effect({ ...ctx, app: { ...ctx.app, channel: "boc" } }).pipe(
                    Effect.provide(services),
                  ),
              },
            ])
            expect(yield* plugins.list()).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ id: "boc.project-controls", state: { status: "active" } }),
              ]),
            )
            const client = rpc.client(BocControls.Rpc)
            const initial = yield* client.getState({})
            expect(initial.items.find((item) => item.kind === "agent" && item.id === "writer")).toMatchObject({
              origin: "global",
              source: globalConfig,
              effective: "enabled",
            })
            expect(initial.items.find((item) => item.kind === "agent" && item.id === "builder")).toMatchObject({
              origin: "project",
              source: projectConfig,
              effective: "enabled",
            })
            expect(initial.items.find((item) => item.kind === "mcp" && item.id === "remote")).toMatchObject({
              origin: "global",
              source: globalConfig,
            })

            const configuration = yield* client.getConfiguration({ scope: "project" })
            expect(configuration.instructionExists).toBe(false)
            yield* client.saveConfiguration({
              scope: "project",
              expectedRevision: configuration.revision,
              content: JSON.stringify({
                agents: {
                  builder: { model: "example/project", system: "Project prompt" },
                  saved: { model: "example/saved", system: "Saved through controls" },
                },
              }),
            })
            yield* waitUntil(
              "saved agent",
              agents
                .get(Agent.ID.make("saved"))
                .pipe(Effect.map((agent) => agent?.system === "Saved through controls")),
            )

            yield* client.setEnabled({ kind: "agent", id: "writer", enabled: false, expectedRevision: 0 })
            yield* waitUntil(
              "writer disabled",
              agents.get(Agent.ID.make("writer")).pipe(Effect.map((agent) => agent === undefined)),
            )
            yield* waitUntil(
              "writer state applied",
              client.getState({}).pipe(
                Effect.map(
                  (state) =>
                    state.items.find((item) => item.kind === "agent" && item.id === "writer")?.effective === "disabled",
                ),
                Effect.orDie,
              ),
            )
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "agent" && item.id === "writer"),
            ).toMatchObject({
              origin: "project",
              effective: "disabled",
            })
            yield* client.setEnabled({ kind: "agent", id: "writer", enabled: true, expectedRevision: 1 })
            yield* waitUntil(
              "writer re-enabled",
              agents.get(Agent.ID.make("writer")).pipe(Effect.map((agent) => agent !== undefined)),
            )
            expect(yield* agents.get(Agent.ID.make("writer"))).toMatchObject({ system: "Global prompt" })
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "agent" && item.id === "writer"),
            ).toMatchObject({
              model: "example/global",
              effective: "enabled",
            })
            expect(parse(yield* Effect.promise(() => Bun.file(projectConfig).text())).agents.writer).toMatchObject({
              system: `{file:${path.join(global, "writer.txt")}}`,
            })

            yield* client.setEnabled({ kind: "agent", id: "builder", enabled: false, expectedRevision: 2 })
            yield* waitUntil(
              "builder disabled",
              agents.get(Agent.ID.make("builder")).pipe(Effect.map((agent) => agent === undefined)),
            )
            yield* client.setEnabled({ kind: "agent", id: "builder", enabled: true, expectedRevision: 3 })
            yield* waitUntil(
              "builder re-enabled",
              agents.get(Agent.ID.make("builder")).pipe(Effect.map((agent) => agent !== undefined)),
            )
            expect(yield* agents.get(Agent.ID.make("builder"))).toMatchObject({ system: "Project prompt" })
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "agent" && item.id === "builder"),
            ).toMatchObject({
              model: "example/project",
              effective: "enabled",
            })

            yield* client.setEnabled({ kind: "mcp", id: "remote", enabled: false, expectedRevision: 4 })
            yield* waitUntil(
              "mcp disabled",
              client.getConfiguration({ scope: "project" }).pipe(
                Effect.map((value) => parse(value.content).mcp?.servers?.remote?.disabled === true),
                Effect.orDie,
              ),
            )
            yield* client.setEnabled({ kind: "mcp", id: "remote", enabled: true, expectedRevision: 5 })
            yield* waitUntil(
              "mcp re-enabled",
              client.getConfiguration({ scope: "project" }).pipe(
                Effect.map((value) => parse(value.content).mcp?.servers?.remote?.disabled === false),
                Effect.orDie,
              ),
            )
            expect(parse(yield* Effect.promise(() => Bun.file(projectConfig).text())).mcp.servers.remote).toMatchObject(
              {
                headers: { Authorization: "Bearer {env:HOME}" },
                disabled: false,
              },
            )

            yield* client.createSource({
              kind: "instruction",
              scope: "project",
              name: "AGENTS.md",
              content: "Project guidance\n",
            })
            expect((yield* client.getConfiguration({ scope: "project" })).instructionExists).toBe(true)

            const created = yield* client.createSource({
              kind: "skill",
              scope: "project",
              name: "draft",
              content: "---\nname: Draft\n---\nFirst draft\n",
            })
            yield* waitUntil(
              "skill created",
              client.getState({}).pipe(
                Effect.map((state) => state.items.some((item) => item.kind === "skill" && item.id === "draft")),
                Effect.orDie,
              ),
            )
            const source = yield* client.getSource({ kind: "skill", id: "draft" })
            const saved = yield* client.saveSource({
              kind: "skill",
              id: "draft",
              expectedRevision: source.revision,
              content: "---\nname: Draft\n---\nUpdated draft\n",
            })
            expect(saved.content).toContain("Updated draft")
            yield* client.deleteSource({ kind: "skill", id: "draft", expectedRevision: saved.revision })
            yield* waitUntil(
              "skill deleted",
              client.getState({}).pipe(
                Effect.map((state) => state.items.every((item) => item.kind !== "skill" || item.id !== "draft")),
                Effect.orDie,
              ),
            )
          }).pipe(Effect.provide(liveControlsLayer(project, global))),
        ),
      )
    }),
  ),
)

function liveControlsLayer(project: string, global: string) {
  return AppNodeBuilder.build(
    LayerNode.group([
      Plugin.node,
      Agent.node,
      Mcp.node,
      Config.node,
      Watcher.node,
      BocControlPolicy.node,
      BocSelection.node,
      FSUtil.node,
      Tool.node,
      Skill.node,
      SkillDiscovery.node,
      Rpc.node,
      Location.node,
      Global.node,
      KV.node,
      InstructionDiscovery.node,
    ]),
    [
      Config.node.replace(Config.configured()),
      Location.node.replace(
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(project) }))),
      ),
      Global.node.replace(Global.layerWith({ config: global, home: path.join(global, "home") })),
      Credential.node.replace(emptyCredentialNode),
      WellKnown.node.replace(emptyWellknownNode),
    ],
  )
}

const waitUntil = Effect.fnUntraced(function* (name: string, condition: Effect.Effect<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (yield* condition) return
    yield* Effect.sleep("20 millis")
  }
  return yield* Effect.die(`Timed out waiting for ${name}`)
})
