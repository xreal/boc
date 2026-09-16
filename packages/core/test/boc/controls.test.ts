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
      Global.node.replace(
        Layer.unwrap(
          Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
            Effect.map((tmp) => Global.layerWith({ config: path.join(tmp.path, "config"), home: tmp.path })),
          ),
        ),
      ),
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

it.live("native controls enforce saved tools and skills, retain source and reject stale revisions", () =>
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
            yield* ctx.agent.transform((editor) =>
              editor.update(Agent.ID.make("bundled"), (agent) => {
                agent.system = "Bundled agent without a configuration source"
              }),
            )
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
                path: AbsolutePath.make("/builtin/guide.md"),
                content: "Guide",
              }),
            )
            yield* ctx.skill.transform((editor) =>
              editor.add({
                id: Skill.ID.make("removable"),
                name: Skill.Name.make("Removable"),
                description: "",
                path: AbsolutePath.make(removableSkill),
                content: "Temporary skill",
              }),
            )
            yield* ctx.skill.transform((editor) =>
              editor.add({
                id: Skill.ID.make("legacy-global"),
                name: Skill.Name.make("Legacy global"),
                description: "",
                path: AbsolutePath.make(legacyGlobalSkill),
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
    expect(initial.items.find((item) => item.kind === "agent" && item.id === "bundled")).toMatchObject({
      mutable: false,
      reason: "read_only",
    })
    expect(
      yield* client.setEnabled({ kind: "agent", id: "bundled", enabled: false, expectedRevision: 0 }).pipe(Effect.flip),
    ).toMatchObject({ type: "not_supported" })
    expect(initial.items.find((item) => item.id === "sample")?.origin).toBe("system")
    expect(initial.items.find((item) => item.id === "guide")?.origin).toBe("system")
    const globalState = yield* client.getState({ scope: "global" })
    expect(globalState.items.some((item) => item.kind === "tool")).toBe(false)
    expect(globalState.items.find((item) => item.source === `${global.config}/AGENTS.md`)).toMatchObject({
      origin: "global",
      mutable: true,
    })
    yield* client.setEnabled({
      scope: "global",
      kind: "instruction",
      id: `${global.config}/AGENTS.md`,
      enabled: false,
      expectedRevision: 0,
    })
    const withoutGlobalInstruction = yield* discovery.list()
    expect(
      Array.isArray(withoutGlobalInstruction) &&
        withoutGlobalInstruction.every((file) => file.path !== `${global.config}/AGENTS.md`),
    ).toBe(true)
    yield* client.setEnabled({
      scope: "global",
      kind: "instruction",
      id: `${global.config}/AGENTS.md`,
      enabled: true,
      expectedRevision: 1,
    })
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
        await fs.mkdir(path.join(global, "skill", "shared"), { recursive: true })
        await Bun.write(
          path.join(global, "skill", "shared", "SKILL.md"),
          "---\nname: Shared\ndescription: Shared globally\n---\nShared skill\n",
        )
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
        await fs.mkdir(path.join(project, ".opencode", "agents"), { recursive: true })
        await Bun.write(
          path.join(project, ".opencode", "agents", "reviewer.md"),
          "---\ndescription: Reviews changes\nmodel: example/reviewer\n---\nReview the current changes.\n",
        )
      }).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const plugins = yield* Plugin.Service
            const rpc = yield* Rpc.Service
            const agents = yield* Agent.Service
            const skills = yield* Skill.Service
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
            const globalState = yield* client.getState({ scope: "global" })
            expect(globalState.items).toEqual(
              expect.arrayContaining([
                expect.objectContaining({ kind: "agent", id: "writer", origin: "global" }),
                expect.objectContaining({ kind: "mcp", id: "remote", origin: "global" }),
                expect.objectContaining({ kind: "skill", id: "shared", origin: "global" }),
              ]),
            )
            expect(globalState.items.some((item) => item.id === "builder" || item.kind === "tool")).toBe(false)
            yield* client.setEnabled({
              scope: "global",
              kind: "skill",
              id: "shared",
              enabled: false,
              expectedRevision: 0,
            })
            expect(yield* skills.get(Skill.ID.make("shared"))).toBeUndefined()
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "skill" && item.id === "shared"),
            ).toMatchObject({ effective: "disabled", mutable: false, reason: "disabled_globally" })
            yield* client.setEnabled({
              scope: "global",
              kind: "skill",
              id: "shared",
              enabled: true,
              expectedRevision: 1,
            })
            expect(yield* skills.get(Skill.ID.make("shared"))).toBeDefined()
            yield* client.setEnabled({
              scope: "global",
              kind: "agent",
              id: "writer",
              enabled: false,
              expectedRevision: 2,
            })
            yield* waitUntil(
              "globally disabled writer",
              agents.get(Agent.ID.make("writer")).pipe(Effect.map((agent) => agent === undefined)),
            )
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "agent" && item.id === "writer"),
            ).toMatchObject({ effective: "disabled", mutable: false, reason: "disabled_globally" })
            yield* client.setEnabled({
              scope: "global",
              kind: "agent",
              id: "writer",
              enabled: true,
              expectedRevision: 3,
            })
            yield* waitUntil(
              "globally enabled writer",
              client.getState({ scope: "global" }).pipe(
                Effect.map((state) => {
                  const writer = state.items.find((item) => item.kind === "agent" && item.id === "writer")
                  return writer?.application === "applied" && writer.effective === "enabled"
                }),
                Effect.orDie,
              ),
            )

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
              client.getState({}).pipe(
                Effect.map((state) => {
                  const writer = state.items.find((item) => item.kind === "agent" && item.id === "writer")
                  return writer?.application === "applied" && writer.effective === "enabled"
                }),
                Effect.orDie,
              ),
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

            yield* client.setEnabled({ kind: "agent", id: "reviewer", enabled: false, expectedRevision: 6 })
            yield* waitUntil(
              "markdown agent disabled",
              client.getState({}).pipe(
                Effect.map((state) => {
                  const reviewer = state.items.find((item) => item.kind === "agent" && item.id === "reviewer")
                  return reviewer?.present === true && reviewer.effective === "disabled"
                }),
                Effect.orDie,
              ),
            )
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toBeUndefined()
            yield* client.setEnabled({ kind: "agent", id: "reviewer", enabled: true, expectedRevision: 7 })
            yield* waitUntil(
              "markdown agent enabled",
              agents.get(Agent.ID.make("reviewer")).pipe(Effect.map((agent) => agent !== undefined)),
            )
            expect(parse(yield* Effect.promise(() => Bun.file(projectConfig).text())).agents?.reviewer).toBeUndefined()

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

            const disabledBuilder = yield* client.setEnabled({
              kind: "agent",
              id: "builder",
              enabled: false,
              expectedRevision: 8,
            })
            expect(disabledBuilder.items.find((item) => item.kind === "agent" && item.id === "builder")?.override).toBe(
              false,
            )
            expect(disabledBuilder.items.find((item) => item.kind === "agent" && item.id === "writer")).toMatchObject({
              effective: "enabled",
              application: "applied",
            })
            yield* waitUntil(
              "builder removal",
              agents.get(Agent.ID.make("builder")).pipe(Effect.map((agent) => !agent)),
            )
            const repeatedDisable = yield* client.setEnabled({
              kind: "agent",
              id: "builder",
              enabled: false,
              expectedRevision: 9,
            })
            expect(repeatedDisable.items.find((item) => item.kind === "agent" && item.id === "builder")).toMatchObject({
              override: false,
              effective: "disabled",
              application: "applied",
            })
            const cleared = yield* client.clearOverride({ kind: "agent", id: "builder", expectedRevision: 10 })
            yield* waitUntil("builder reset", agents.get(Agent.ID.make("builder")).pipe(Effect.map((agent) => !!agent)))
            const repeatedClear = yield* client.clearOverride({
              kind: "agent",
              id: "builder",
              expectedRevision: cleared.revision,
            })
            expect(repeatedClear.items.find((item) => item.kind === "agent" && item.id === "builder")).toMatchObject({
              override: null,
              effective: "enabled",
              application: "applied",
            })
            const disabledMcp = yield* client.setEnabled({
              kind: "mcp",
              id: "remote",
              enabled: false,
              expectedRevision: repeatedClear.revision,
            })
            yield* waitUntil(
              "MCP disconnected",
              client.getState({}).pipe(
                Effect.map((state) =>
                  state.items.some(
                    (item) =>
                      item.kind === "mcp" &&
                      item.id === "remote" &&
                      item.availability === "disabled" &&
                      item.application === "applied",
                  ),
                ),
                Effect.orDie,
              ),
            )
            const repeatedMcp = yield* client.setEnabled({
              kind: "mcp",
              id: "remote",
              enabled: false,
              expectedRevision: disabledMcp.revision,
            })
            expect(repeatedMcp.items.find((item) => item.kind === "mcp" && item.id === "remote")).toMatchObject({
              override: false,
              effective: "disabled",
              application: "applied",
              availability: "disabled",
            })
          }).pipe(Effect.provide(liveControlsLayer(project, global))),
        ),
      )
    }),
  ),
)

live.live("native toggles reload configuration even without filesystem watches", () =>
  Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
    Effect.flatMap((tmp) => {
      const project = path.join(tmp.path, "project")
      const global = path.join(tmp.path, "global")
      return Effect.promise(async () => {
        await fs.mkdir(project, { recursive: true })
        await fs.mkdir(global, { recursive: true })
        await fs.mkdir(path.join(global, "agents"), { recursive: true })
        await Bun.write(
          path.join(global, "agents", "reviewer.md"),
          "---\nmode: subagent\ndescription: Reviews changes\n---\nReview carefully.\n",
        )
        await Bun.write(
          path.join(project, "opencode.jsonc"),
          JSON.stringify({
            agents: { writer: { system: "Write clearly" } },
            mcp: {
              servers: { remote: { type: "remote", url: "http://127.0.0.1:1/mcp", oauth: false, disabled: true } },
            },
          }),
        )
      }).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const plugins = yield* Plugin.Service
            const rpc = yield* Rpc.Service
            const agents = yield* Agent.Service
            const services = yield* Effect.context<
              | Config.Service
              | FSUtil.Service
              | Global.Service
              | BocControlPolicy.Service
              | BocSelection.Service
              | InstructionDiscovery.Service
              | Tool.Service
              | Location.Service
              | Mcp.Service
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
                ...BocProjectControls.Definition,
                revision: "1",
                source: { type: "builtin" },
                effect: (ctx) =>
                  BocProjectControls.Definition.effect({ ...ctx, app: { ...ctx.app, channel: "boc" } }).pipe(
                    Effect.provide(services),
                  ),
              },
            ])
            const client = rpc.client(BocControls.Rpc)
            // A mutation is valid before any controls snapshot or agent listing.
            const coldDisable = yield* client.setEnabled({
              kind: "agent",
              id: "reviewer",
              enabled: false,
              expectedRevision: 0,
            })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toBeUndefined()
            const coldReset = yield* client.clearOverride({
              kind: "agent",
              id: "reviewer",
              expectedRevision: coldDisable.revision,
            })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toMatchObject({ system: "Review carefully." })
            expect(yield* agents.get(Agent.ID.make("writer"))).toBeDefined()
            const disabled = yield* client.setEnabled({
              kind: "agent",
              id: "writer",
              enabled: false,
              expectedRevision: coldReset.revision,
            })
            expect(disabled.items.find((item) => item.kind === "agent" && item.id === "writer")?.override).toBe(false)
            yield* waitUntil(
              "disable without watcher",
              agents.get(Agent.ID.make("writer")).pipe(Effect.map((agent) => !agent)),
            )
            const enabled = yield* client.setEnabled({
              kind: "agent",
              id: "writer",
              enabled: true,
              expectedRevision: disabled.revision,
            })
            yield* waitUntil(
              "enable without watcher",
              agents.get(Agent.ID.make("writer")).pipe(Effect.map((agent) => !!agent)),
            )
            const state = yield* client.getState({})
            expect(state.items.find((item) => item.kind === "agent" && item.id === "writer")).toMatchObject({
              override: true,
              effective: "enabled",
              application: "applied",
            })
            const cleared = yield* client.clearOverride({
              kind: "agent",
              id: "writer",
              expectedRevision: enabled.revision,
            })
            expect(cleared.items.find((item) => item.kind === "agent" && item.id === "writer")).toMatchObject({
              override: null,
              effective: "enabled",
              application: "applied",
            })
            const enabledMcp = yield* client.setEnabled({
              kind: "mcp",
              id: "remote",
              enabled: true,
              expectedRevision: cleared.revision,
            })
            yield* waitUntil(
              "MCP enable without watcher",
              client.getState({}).pipe(
                Effect.map((state) =>
                  state.items.some(
                    (item) =>
                      item.kind === "mcp" &&
                      item.id === "remote" &&
                      item.effective === "enabled" &&
                      item.application === "applied",
                  ),
                ),
                Effect.orDie,
              ),
            )
            yield* client.setEnabled({
              kind: "mcp",
              id: "remote",
              enabled: false,
              expectedRevision: enabledMcp.revision,
            })
            yield* waitUntil(
              "MCP disable without watcher",
              client.getState({}).pipe(
                Effect.map((state) =>
                  state.items.some(
                    (item) =>
                      item.kind === "mcp" &&
                      item.id === "remote" &&
                      item.effective === "disabled" &&
                      item.application === "applied",
                  ),
                ),
                Effect.orDie,
              ),
            )
            const beforeReview = yield* client.getState({})
            expect(beforeReview.items.find((item) => item.kind === "agent" && item.id === "reviewer")).toMatchObject({
              origin: "global",
              mutable: true,
              effective: "enabled",
            })
            const withoutReviewer = yield* client.setEnabled({
              kind: "agent",
              id: "reviewer",
              enabled: false,
              expectedRevision: beforeReview.revision,
            })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toBeUndefined()
            expect(withoutReviewer.items.find((item) => item.kind === "agent" && item.id === "reviewer")).toMatchObject(
              {
                override: false,
                effective: "disabled",
                application: "applied",
              },
            )
            const globalReview = yield* client.getState({ scope: "global" })
            expect(globalReview.items.find((item) => item.kind === "agent" && item.id === "reviewer")).toMatchObject({
              origin: "global",
              mutable: true,
              effective: "enabled",
            })
            yield* client.clearOverride({ kind: "agent", id: "reviewer", expectedRevision: withoutReviewer.revision })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toBeDefined()
            const globallyDisabled = yield* client.setEnabled({
              scope: "global",
              kind: "agent",
              id: "reviewer",
              enabled: false,
              expectedRevision: globalReview.revision,
            })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toBeUndefined()
            expect(
              globallyDisabled.items.find((item) => item.kind === "agent" && item.id === "reviewer"),
            ).toMatchObject({
              mutable: true,
              override: false,
              effective: "disabled",
            })
            const projectReview = yield* client.getState({})
            expect(projectReview.items.find((item) => item.kind === "agent" && item.id === "reviewer")).toMatchObject({
              mutable: false,
              effective: "disabled",
              reason: "disabled_globally",
            })
            expect(
              yield* client
                .setEnabled({
                  kind: "agent",
                  id: "reviewer",
                  enabled: true,
                  expectedRevision: projectReview.revision,
                })
                .pipe(Effect.flip),
            ).toMatchObject({ type: "not_supported" })
            const globallyEnabled = yield* client.setEnabled({
              scope: "global",
              kind: "agent",
              id: "reviewer",
              enabled: true,
              expectedRevision: globallyDisabled.revision,
            })
            expect(yield* agents.get(Agent.ID.make("reviewer"))).toMatchObject({ system: "Review carefully." })
            expect(globallyEnabled.items.find((item) => item.kind === "agent" && item.id === "reviewer")).toMatchObject(
              {
                override: null,
                effective: "enabled",
              },
            )
            yield* client.clearOverride({
              scope: "global",
              kind: "agent",
              id: "reviewer",
              expectedRevision: globallyEnabled.revision,
            })
            expect(
              (yield* client.getState({})).items.find((item) => item.kind === "agent" && item.id === "reviewer"),
            ).toMatchObject({
              mutable: true,
              override: null,
              effective: "enabled",
              application: "applied",
            })
            expect(yield* Effect.promise(() => Bun.file(path.join(global, "agents", "reviewer.md")).text())).toBe(
              "---\nmode: subagent\ndescription: Reviews changes\n---\nReview carefully.\n",
            )
            expect(
              parse((yield* client.getConfiguration({ scope: "project" })).content).agents.reviewer,
            ).toBeUndefined()
            expect(parse((yield* client.getConfiguration({ scope: "global" })).content).agents).toBeUndefined()
          }).pipe(Effect.provide(liveControlsLayer(project, global, false))),
        ),
      )
    }),
  ),
)

function liveControlsLayer(project: string, global: string, watches = true) {
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
      ...(watches
        ? []
        : [Watcher.node.replace(Watcher.layer({ enabled: false }).pipe(Layer.provide(Watcher.nativeLayer)))]),
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
