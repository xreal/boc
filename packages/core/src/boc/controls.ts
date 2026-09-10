export * as BocProjectControls from "./controls.js"

import { BocControls } from "@opencode/schema/boc/controls"
import { Info } from "@opencode/schema/config"
import type { Plugin } from "@opencode/schema/plugin"
import type { RpcCallContext } from "@opencode/plugin/effect/rpc"
import { define } from "@opencode/plugin/effect/plugin"
import { FSUtil } from "@opencode/util/fs-util"
import { Global } from "@opencode/util/global"
import { Hash } from "@opencode/util/hash"
import { Effect, Option, Schema, Stream } from "effect"
import { applyEdits, modify, parse, type ParseError } from "jsonc-parser"
import path from "path"
import { Config } from "../config.js"
import { ConfigNormalize } from "../config/normalize.js"
import { SkillFile } from "../config/plugin/skill-file.js"
import { Tool } from "../tool.js"
import { McpTool } from "../tool/mcp.js"
import { BocControlPolicy } from "./control-policy.js"
import { BocControlSource } from "./control-source.js"
import { BocSelection } from "./selection.js"
import { InstructionDiscovery } from "../instruction-discovery.js"

type Capability = {
  id: string
  name: string
  description: string
  value?: object
  source?: string
  namespace?: string
  defaultAgent?: boolean
  agentMode?: "primary" | "subagent" | "all"
  model?: string
  nativeOverride?: boolean
  definition?: object
  defaultEnabled: boolean
  mutable: boolean
}

export const Definition = define({
  id: "boc.project-controls",
  effect: Effect.fn("BocProjectControls.register")(function* (ctx) {
    if (ctx.app.channel !== "boc") return
    const policies = yield* BocControlPolicy.Service
    const config = yield* Config.Service
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    const tools = yield* Tool.Service
    const selection = yield* BocSelection.Service
    const discovery = yield* InstructionDiscovery.Service
    const project = yield* policies.project(ctx.location.project.id)
    const inventory: Record<BocControls.Kind, Capability[]> = {
      agent: [],
      skill: [],
      tool: [],
      mcp: [],
      instruction: [],
    }
    const failed = new Set<BocControls.Kind>()
    const pending = new Set<BocControls.Kind>()
    const disabled = (kind: BocControls.Kind, id: string) => project.policy.settings[kind][id] === false
    const configurationPath = (scope: BocControls.ConfigurationScope) =>
      scope === "global"
        ? path.join(global.config, "opencode.jsonc")
        : path.join(ctx.location.directory, ".opencode", "opencode.jsonc")
    const sourceScope = (filepath: string) => {
      if (
        [global.config, path.join(global.home, ".agents"), path.join(global.home, ".claude")].some((root) =>
          FSUtil.contains(root, filepath),
        )
      )
        return "global" as const
      if ([ctx.location.project.canonical, ctx.location.directory].some((root) => FSUtil.contains(root, filepath)))
        return "project" as const
      return
    }
    const rawInfo = Effect.fn("BocProjectControls.rawInfo")(function* (filepath: string | undefined) {
      if (!filepath) return
      const content = yield* fs.readFileStringSafe(filepath)
      if (content === undefined) return
      const errors: ParseError[] = []
      const value = parse(content, errors, { allowTrailingComma: true })
      if (errors.length) return
      const normalized = ConfigNormalize.normalize(value)
      if (normalized.type === "rejected") return
      return Option.getOrUndefined(Schema.decodeUnknownOption(Info)(normalized.encoded))
    })
    const rawDefinition = Effect.fn("BocProjectControls.rawDefinition")(function* (
      filepath: string | undefined,
      kind: "agent" | "mcp",
      id: string,
    ) {
      const info = yield* rawInfo(filepath)
      if (kind === "agent") return info?.agents?.[id]
      return info?.mcp?.servers?.[id]
    })
    const configuration = Effect.fn("BocProjectControls.configuration")(function* (
      scope: BocControls.ConfigurationScope,
    ) {
      const filepath = configurationPath(scope)
      const content = (yield* fs.readFileStringSafe(filepath)) ?? "{}\n"
      const instructionExists = yield* fs.existsSafe(
        path.join(scope === "global" ? global.config : ctx.location.directory, "AGENTS.md"),
      )
      const entries = (yield* config.entries()).filter(
        (entry) =>
          entry.type === "document" &&
          (scope === "project" || (entry.path && FSUtil.contains(global.config, entry.path))),
      )
      const mcp = Object.assign(
        {},
        ...(yield* Effect.forEach(entries, (entry) =>
          rawInfo(entry.path).pipe(Effect.map((info) => info?.mcp?.servers ?? {})),
        )),
      )
      return {
        scope,
        path: filepath,
        content,
        revision: Hash.sha256(content),
        ...(Object.keys(mcp).length ? { mcp } : {}),
        instructionExists,
      }
    })
    const saveConfiguration = Effect.fn("BocProjectControls.saveConfiguration")(function* (input: {
      scope: BocControls.ConfigurationScope
      content: string
      expectedRevision: string
    }) {
      const current = yield* configuration(input.scope)
      if (current.revision !== input.expectedRevision) return { type: "conflict" as const, revision: current.revision }
      if (!validConfiguration(input.content)) return { type: "invalid" as const }
      yield* fs.writeWithDirs(current.path, input.content)
      return { type: "saved" as const, configuration: yield* configuration(input.scope) }
    })
    const source = Effect.fn("BocProjectControls.source")(function* (input: {
      kind: BocControls.SourceKind
      id: string
    }) {
      yield* state()
      const item = inventory[input.kind].find((item) => item.id === input.id)
      if (!item?.source) return
      const scope = sourceScope(item.source)
      if (!scope) return
      const content = yield* fs.readFileStringSafe(item.source)
      if (content === undefined) return
      return { kind: input.kind, scope, id: input.id, path: item.source, content, revision: Hash.sha256(content) }
    })
    const saveSource = Effect.fn("BocProjectControls.saveSource")(function* (input: {
      kind: BocControls.SourceKind
      id: string
      content: string
      expectedRevision: string
    }) {
      const current = yield* source(input)
      if (!current) return { type: "missing" as const }
      if (current.revision !== input.expectedRevision) return { type: "conflict" as const }
      if (!validSource(current, input.content)) return { type: "invalid" as const }
      yield* fs.writeFileString(current.path, input.content)
      return {
        type: "saved" as const,
        source: { ...current, content: input.content, revision: Hash.sha256(input.content) },
      }
    })
    const createSource = Effect.fn("BocProjectControls.createSource")(function* (input: {
      kind: BocControls.SourceKind
      scope: BocControls.ConfigurationScope
      name: string
      content: string
    }) {
      if (input.kind === "skill" && !safeSourceName(input.name)) return { type: "invalid" as const }
      const filepath =
        input.kind === "skill"
          ? path.join(
              input.scope === "global" ? global.config : path.join(ctx.location.directory, ".opencode"),
              "skill",
              input.name,
              "SKILL.md",
            )
          : input.name === "AGENTS.md"
            ? path.join(input.scope === "global" ? global.config : ctx.location.directory, "AGENTS.md")
            : undefined
      if (!filepath || !validSource({ kind: input.kind, path: filepath }, input.content))
        return { type: "invalid" as const }
      if (yield* fs.existsSafe(filepath)) return { type: "conflict" as const }
      yield* fs.writeWithDirs(filepath, input.content)
      return {
        type: "saved" as const,
        source: {
          kind: input.kind,
          scope: input.scope,
          id: input.kind === "skill" ? input.name : "AGENTS.md",
          path: filepath,
          content: input.content,
          revision: Hash.sha256(input.content),
        },
      }
    })
    const deleteSource = Effect.fn("BocProjectControls.deleteSource")(function* (input: {
      kind: BocControls.SourceKind
      id: string
      expectedRevision: string
    }) {
      const current = yield* source(input)
      if (!current) return { type: "missing" as const }
      if (current.revision !== input.expectedRevision) return { type: "conflict" as const }
      yield* fs.remove(current.path)
      return { type: "deleted" as const }
    })

    yield* ctx.skill.transform((editor) => {
      inventory.skill = editor.list().map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description ?? "",
        source: skill.location,
        defaultEnabled: true,
        mutable: true,
      }))
      inventory.skill.filter((item) => disabled("skill", item.id)).forEach((item) => editor.remove(item.id))
    })
    yield* ctx.tool.transform((editor) => {
      inventory.tool = editor.list().map((tool) => ({
        id: tool.id,
        name: tool.id,
        description: tool.description,
        value: tool,
        namespace: tool.options?.namespace,
        defaultEnabled: true,
        mutable: true,
      }))
      inventory.tool.filter((item) => disabled("tool", item.id)).forEach((item) => editor.remove(item.id))
    })
    yield* ctx.mcp.transform((editor) => {
      inventory.mcp = editor.list().map(([id, value]) => ({
        id,
        name: id,
        description: "",
        value,
        defaultEnabled: !value.disabled,
        source: sourceOf(value),
        mutable: !pluginSource(value),
        ...(value.disabled === undefined ? {} : { nativeOverride: !value.disabled }),
      }))
      // Preserve established MCP policy behavior until each saved override is
      // explicitly migrated or cleared through native configuration.
      inventory.mcp.forEach((item) => {
        const enabled = project.policy.settings.mcp[item.id]
        if (enabled !== undefined)
          editor.update(item.id, (value) => {
            value.disabled = !enabled
          })
      })
    })
    yield* selection.register((event) => {
      inventory.instruction = event.candidates.map((item) => ({
        id: item.id,
        name: path.basename(item.path),
        description: "",
        source: item.path,
        defaultEnabled: true,
        mutable: item.source === "project",
      }))
      inventory.instruction
        .filter((item) => item.mutable && disabled("instruction", item.id))
        .forEach((item) => event.exclude(item.id))
    })
    yield* ctx.permission.hook("evaluate", (event) =>
      Effect.sync(() => {
        if (event.action === "skill" && event.resources.some((id) => disabled("skill", id))) event.effect = "deny"
      }),
    )
    yield* ctx.session.hook("context", (event) =>
      Effect.sync(() => {
        Object.keys(event.tools)
          .filter((id) => disabled("tool", id))
          .forEach((id) => delete event.tools[id])
      }),
    )
    yield* ctx.tool.hook("execute.before", (event) =>
      disabled("tool", event.tool) ? Effect.die(new Error("boc.controls.tool_disabled")) : Effect.void,
    )

    const info = () => ({
      protocol: 1 as const,
      version: "1",
      project: { id: ctx.location.project.id, canonical: ctx.location.project.canonical },
      location: {
        directory: ctx.location.directory,
        ...(ctx.location.workspaceID ? { workspaceID: ctx.location.workspaceID } : {}),
      },
      source: "bundled" as const,
      scope: "project-on-server" as const,
      categories: [...BocControls.kinds],
      operations: [
        "info",
        "getState",
        "getConfiguration",
        "saveConfiguration",
        "getSource",
        "saveSource",
        "createSource",
        "deleteSource",
        "setEnabled",
        "clearOverride",
        "retryApply",
      ],
    })
    const reload = (kind: BocControls.Kind) => {
      if (kind === "agent") return ctx.agent.reload()
      if (kind === "skill") return ctx.skill.reload()
      if (kind === "tool") return ctx.tool.reload()
      if (kind === "mcp") return ctx.mcp.reload()
      return Effect.void
    }
    const state = Effect.fn("BocProjectControls.state")(function* () {
      const documents = (yield* config.entries()).filter((entry) => entry.type === "document")
      const defaultAgent = Config.latest(documents, "default_agent")
      const agents = yield* ctx.agent.list({})
      inventory.agent = agents.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? "",
        value: agent,
        defaultEnabled: true,
        source: sourceOf(agent),
        mutable: true,
        ...(defaultAgent === agent.id && agent.mode !== "subagent" ? { defaultAgent: true } : {}),
        ...(agent.mode ? { agentMode: agent.mode } : {}),
        ...(agent.model ? { model: formatModel(agent.model) } : {}),
      }))
      const configuredAgents = new Map(
        documents.flatMap((document) =>
          Object.entries(document.info.agents ?? {}).map(
            ([id, agent]) => [id, { id, agent, source: document.path }] as const,
          ),
        ),
      )
      Array.from(configuredAgents.values())
        .filter(({ id }) => !inventory.agent.some((agent) => agent.id === id))
        .forEach(({ id, agent, source }) =>
          inventory.agent.push({
            id,
            name: id,
            description: agent.description ?? "",
            source,
            definition: agent,
            ...(agent.disabled === undefined ? {} : { nativeOverride: !agent.disabled }),
            defaultEnabled: true,
            mutable: true,
            ...(defaultAgent === id && agent.mode !== "subagent" && !agent.disabled ? { defaultAgent: true } : {}),
            ...(agent.mode ? { agentMode: agent.mode } : {}),
            ...(agent.model ? { model: formatModel(agent.model) } : {}),
          }),
        )
      configuredAgents.forEach(({ id, agent }) => {
        const capability = inventory.agent.find((item) => item.id === id)
        if (capability) capability.definition = agent
      })
      // Transforms capture inventory. Listing and snapshotting force those transforms to run.
      yield* ctx.skill.list({})
      yield* tools.snapshot()
      const mcp = yield* ctx.mcp.list({})
      const instructions = yield* discovery.list()
      const plugins = yield* ctx.plugin.list({})
      inventory.agent.forEach((agent) => {
        const source = agent.value && BocControlSource.get(agent.value)
        if (!source || !("plugin" in source)) return
        const plugin = plugins.data.find((item) => item.id === source.plugin)
        if (plugin?.source.type === "builtin" || plugin?.source.type === "sdk") return
        agent.mutable = false
      })
      const statuses = new Map(mcp.data.map((item) => [item.name, item.status.status]))
      const incomplete: BocControls.Kind[] = Array.isArray(instructions) ? [] : ["instruction"]
      const items = BocControls.kinds.flatMap((kind) => {
        const known = new Set(inventory[kind].map((item) => item.id))
        const missing = Object.keys(project.policy.settings[kind])
          .filter(() => kind !== "agent")
          .filter((id) => !known.has(id))
          .map((id) => ({ id, name: id, description: "", defaultEnabled: true, mutable: false }))
        return [...inventory[kind], ...missing].map((item) =>
          describe({
            kind,
            item,
            present: known.has(item.id),
            policy: project.policy,
            failed,
            pending,
            incomplete,
            status: statuses.get(item.id),
            provenance: originOf(item, {
              inventory,
              plugins: plugins.data,
              documents,
              global,
              directory: ctx.location.directory,
              canonical: ctx.location.project.canonical,
            }),
          }),
        )
      })
      return { info: info(), revision: project.policy.revision, items, incomplete }
    })
    const member: BocControlPolicy.Member = {
      apply: (kind) =>
        reload(kind).pipe(
          Effect.tap(() => Effect.sync(() => failed.delete(kind))),
          Effect.catchCause(() =>
            Effect.sync(() => {
              failed.add(kind)
            }),
          ),
          Effect.asVoid,
        ),
      changed: () => Effect.void,
    }
    yield* Effect.acquireRelease(
      Effect.sync(() => project.members.add(member)),
      () => Effect.sync(() => project.members.delete(member)),
    )
    const mutate = (
      change: {
        kind: BocControls.Kind
        id: string
        expectedRevision: number
        action: "set" | "clear" | "retry"
        enabled?: boolean
      },
      call: RpcCallContext<typeof BocControls.Rpc.methods.setEnabled>,
    ) =>
      policies.lock.withPermits(1)(
        Effect.gen(function* () {
          if (change.expectedRevision !== project.policy.revision)
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          const current = yield* state().pipe(Effect.orDie)
          const item = current.items.find((item) => item.kind === change.kind && item.id === change.id)
          if (!item) return yield* Effect.fail(call.error("unknown_capability", "boc.controls.unknown_capability", {}))
          // Clearing is allowed on read-only and missing items so leftover overrides can be removed.
          if (change.action !== "clear" && !item.mutable)
            return yield* Effect.fail(call.error("not_supported", "boc.controls.read_only", {}))
          if (change.action !== "clear" && current.incomplete.includes(change.kind))
            return yield* Effect.fail(call.error("not_ready", "boc.controls.not_ready", {}))
          if (change.action !== "retry") {
            const overrides = { ...project.policy.settings[change.kind] }
            if (change.action === "clear") delete overrides[change.id]
            if (change.action === "set" && change.enabled !== undefined) overrides[change.id] = change.enabled
            const settings = { ...project.policy.settings, [change.kind]: overrides }
            yield* policies
              .save(ctx.location.project.id, project, { revision: project.policy.revision + 1, settings })
              .pipe(
                Effect.catchCause(() =>
                  Effect.fail(call.error("persistence_failed", "boc.controls.persistence_failed", {})),
                ),
              )
          }
          yield* Effect.forEach(project.members, (member) => member.apply(change.kind))
          yield* Effect.forEach(project.members, (member) => member.changed())
          return yield* state().pipe(Effect.orDie)
        }).pipe(Effect.uninterruptible),
      )
    const mutateNative = (
      change: {
        kind: "agent" | "mcp"
        id: string
        expectedRevision: number
        action: "set" | "clear"
        enabled?: boolean
      },
      call: RpcCallContext<typeof BocControls.Rpc.methods.setEnabled>,
    ) =>
      policies.lock.withPermits(1)(
        Effect.gen(function* () {
          if (change.expectedRevision !== project.policy.revision)
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          const current = yield* state().pipe(Effect.orDie)
          const item = current.items.find((item) => item.kind === change.kind && item.id === change.id)
          if (!item) return yield* Effect.fail(call.error("unknown_capability", "boc.controls.unknown_capability", {}))
          if (!item.mutable) return yield* Effect.fail(call.error("not_supported", "boc.controls.read_only", {}))
          const capability = inventory[change.kind].find((item) => item.id === change.id)
          const scope = "project" as const
          const document = yield* configuration(scope).pipe(Effect.orDie)
          const targetContainsDefinition = capability?.source === document.path
          const definition =
            !targetContainsDefinition && change.action === "set"
              ? yield* rawDefinition(capability?.source, change.kind, change.id).pipe(Effect.orDie)
              : undefined
          if (!targetContainsDefinition && change.action === "set" && !definition)
            return yield* Effect.fail(call.error("not_supported", "boc.controls.read_only", {}))
          const path =
            !targetContainsDefinition && change.action === "set"
              ? change.kind === "agent"
                ? ["agents", change.id]
                : ["mcp", "servers", change.id]
              : change.kind === "agent"
                ? ["agents", change.id, "disabled"]
                : ["mcp", "servers", change.id, "disabled"]
          const value =
            change.action === "clear"
              ? undefined
              : !targetContainsDefinition
                ? { ...definition, disabled: !change.enabled }
                : !change.enabled
          const edits =
            change.action === "clear" && !targetContainsDefinition
              ? []
              : modify(document.content, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })
          // The real config watcher can publish before this RPC resumes after the
          // write, so mark pending before saving rather than after it.
          yield* Effect.sync(() => pending.add(change.kind))
          const saved = yield* saveConfiguration({
            scope,
            content: applyEdits(document.content, edits),
            expectedRevision: document.revision,
          }).pipe(Effect.orDie)
          if (saved.type === "conflict") {
            pending.delete(change.kind)
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          }
          if (saved.type === "invalid") {
            pending.delete(change.kind)
            return yield* Effect.fail(call.error("invalid_configuration", "boc.controls.invalid_configuration", {}))
          }
          const legacy = { ...project.policy.settings[change.kind] }
          delete legacy[change.id]
          const settings = { ...project.policy.settings, [change.kind]: legacy }
          yield* policies.save(ctx.location.project.id, project, { revision: project.policy.revision + 1, settings })
          yield* Effect.forEach(project.members, (member) => member.changed())
          return yield* state().pipe(Effect.orDie)
        }).pipe(Effect.uninterruptible),
      )
    const registration = yield* ctx.rpc.register(BocControls.Rpc, {
      info: () => Effect.succeed(info()),
      getState: () => policies.lock.withPermits(1)(state().pipe(Effect.orDie)),
      getConfiguration: ({ scope }) => configuration(scope).pipe(Effect.orDie),
      saveConfiguration: (input, call) =>
        policies.lock.withPermits(1)(
          Effect.gen(function* () {
            const result = yield* saveConfiguration(input).pipe(Effect.orDie)
            if (result.type === "saved") return result.configuration
            if (result.type === "conflict")
              return yield* Effect.fail(
                call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
              )
            return yield* Effect.fail(call.error("invalid_configuration", "boc.controls.invalid_configuration", {}))
          }),
        ),
      getSource: (input, call) =>
        Effect.gen(function* () {
          const result = yield* source(input).pipe(Effect.orDie)
          if (result) return result
          return yield* Effect.fail(call.error("unknown_capability", "boc.controls.unknown_capability", {}))
        }),
      saveSource: (input, call) =>
        Effect.gen(function* () {
          const result = yield* saveSource(input).pipe(Effect.orDie)
          if (result.type === "saved") return result.source
          if (result.type === "conflict")
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          if (result.type === "invalid")
            return yield* Effect.fail(call.error("invalid_source", "boc.controls.invalid_source", {}))
          return yield* Effect.fail(call.error("unknown_capability", "boc.controls.unknown_capability", {}))
        }),
      createSource: (input, call) =>
        Effect.gen(function* () {
          const result = yield* createSource(input).pipe(Effect.orDie)
          if (result.type === "saved") return result.source
          if (result.type === "conflict")
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          return yield* Effect.fail(call.error("invalid_source", "boc.controls.invalid_source", {}))
        }),
      deleteSource: (input, call) =>
        Effect.gen(function* () {
          const result = yield* deleteSource(input).pipe(Effect.orDie)
          if (result.type === "deleted") return {}
          if (result.type === "conflict")
            return yield* Effect.fail(
              call.error("conflict", "boc.controls.conflict", { revision: project.policy.revision }),
            )
          return yield* Effect.fail(call.error("unknown_capability", "boc.controls.unknown_capability", {}))
        }),
      setEnabled: (target, call) => {
        if (target.kind === "agent") return mutateNative({ ...target, kind: "agent", action: "set" }, call)
        if (target.kind === "mcp") return mutateNative({ ...target, kind: "mcp", action: "set" }, call)
        return mutate({ ...target, action: "set" }, call)
      },
      clearOverride: (target, call) => {
        if (target.kind === "agent") return mutateNative({ ...target, kind: "agent", action: "clear" }, call)
        if (target.kind === "mcp") return mutateNative({ ...target, kind: "mcp", action: "clear" }, call)
        return mutate({ ...target, action: "clear" }, call)
      },
      retryApply: (target, call) => mutate({ ...target, action: "retry" }, call),
    })
    member.changed = () =>
      registration.events
        .emit("changed", { projectID: ctx.location.project.id, revision: project.policy.revision })
        .pipe(Effect.ignore)
    yield* ctx.event.subscribe().pipe(
      Stream.filter((event) =>
        ["mcp.status.changed", "mcp.tools.changed", "agent.updated", "skill.updated", "config.updated"].includes(
          event.type,
        ),
      ),
      Stream.debounce("100 millis"),
      Stream.runForEach((event) =>
        Effect.sync(() => {
          if (event.type === "config.updated") {
            pending.delete("agent")
            pending.delete("mcp")
          }
          if (event.type === "agent.updated") pending.delete("agent")
          if (["mcp.status.changed", "mcp.tools.changed"].includes(event.type)) pending.delete("mcp")
        }).pipe(Effect.andThen(member.changed())),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }, Effect.orDie),
})

function describe(input: {
  kind: BocControls.Kind
  item: Capability
  present: boolean
  policy: BocControls.Policy
  failed: Set<BocControls.Kind>
  pending: Set<BocControls.Kind>
  incomplete: readonly BocControls.Kind[]
  status: string | undefined
  provenance: { source: string; origin: typeof BocControls.Origin.Type }
}): BocControls.Item {
  // Agent activation is native. Existing MCP policy overrides retain their
  // prior precedence until users explicitly migrate or clear them.
  const policyOverride = input.policy.settings[input.kind][input.item.id]
  const override =
    input.kind === "agent"
      ? (input.item.nativeOverride ?? null)
      : input.kind === "mcp"
        ? (policyOverride ?? input.item.nativeOverride ?? null)
        : (policyOverride ?? null)
  const enabled = override ?? input.item.defaultEnabled
  const unconfirmed =
    !input.present ||
    (override !== null && !input.item.mutable) ||
    input.failed.has(input.kind) ||
    input.pending.has(input.kind) ||
    input.incomplete.includes(input.kind)
  return {
    kind: input.kind,
    id: input.item.id,
    name: input.item.name,
    description: input.item.description,
    ...input.provenance,
    override,
    defaultEnabled: input.present ? input.item.defaultEnabled : null,
    ...(input.item.defaultAgent ? { defaultAgent: true } : {}),
    ...(input.item.agentMode ? { agentMode: input.item.agentMode } : {}),
    ...(input.item.model ? { model: input.item.model } : {}),
    mutable: input.present && input.item.mutable,
    present: input.present,
    effective: unconfirmed ? "unknown" : enabled ? "enabled" : "disabled",
    application: input.failed.has(input.kind) ? "failed" : input.pending.has(input.kind) ? "pending" : "applied",
    availability: availability(input.kind, input.present, enabled, input.status),
    ...reason(input.present, input.failed.has(input.kind), input.item.mutable, override),
    effect: effect(input.kind),
  }
}

function originOf(
  item: Capability,
  ctx: {
    inventory: Record<BocControls.Kind, Capability[]>
    plugins: ReadonlyArray<{ id?: string; source: Plugin.Source }>
    documents: ReadonlyArray<{
      path?: string
      info: { plugins?: ReadonlyArray<string | { package: string }> }
    }>
    global: Global.Interface
    directory: string
    canonical: string
  },
): { source: string; origin: typeof BocControls.Origin.Type } {
  const recorded = item.value && BocControlSource.get(item.value)
  const server =
    !recorded && item.namespace
      ? ctx.inventory.mcp.find((server) => McpTool.namespace(server.id) === item.namespace)
      : undefined
  if (server) return originOf(server, ctx)

  const plugin =
    recorded && "plugin" in recorded ? ctx.plugins.find((registered) => registered.id === recorded.plugin) : undefined
  const declaration = plugin?.source.type === "package" ? plugin.source.target : undefined
  const document = declaration
    ? ctx.documents.findLast((document) =>
        document.info.plugins?.some((entry) => (typeof entry === "string" ? entry : entry.package) === declaration),
      )
    : undefined
  const file =
    item.source ??
    (recorded && "file" in recorded ? recorded.file : undefined) ??
    (plugin?.source.type === "local" ? plugin.source.path : document?.path)
  if (file) return { source: file, origin: fileOrigin(file, ctx.global, ctx.canonical, ctx.directory) }
  return {
    source: declaration ?? (recorded && "plugin" in recorded ? recorded.plugin : "opencode.registry"),
    origin:
      recorded && "plugin" in recorded && recorded.plugin.startsWith("opencode.")
        ? "system"
        : pluginOrigin(plugin?.source),
  }
}

function availability(
  kind: BocControls.Kind,
  present: boolean,
  enabled: boolean,
  status: string | undefined,
): BocControls.Item["availability"] {
  if (!present) return "unknown"
  if (!enabled) return "disabled"
  if (kind !== "mcp") return "available"
  if (status === "connected") return "available"
  return (status ?? "pending") as BocControls.Item["availability"]
}

function reason(present: boolean, failed: boolean, mutable: boolean, override: boolean | null) {
  if (!present) return { reason: "unavailable" as const }
  if (failed) return { reason: "apply_failed" as const }
  if (!mutable) return { reason: override === null ? ("read_only" as const) : ("unconfirmed_policy" as const) }
  return {}
}

function effect(kind: BocControls.Kind): BocControls.Item["effect"] {
  if (kind === "mcp") return "mcp_reconnect"
  if (kind === "skill") return "next_skill_request"
  if (kind === "instruction") return "next_instruction_request"
  if (kind === "tool") return "next_model_request"
  return "read_only"
}

function fileOrigin(
  file: string,
  global: Global.Interface,
  canonical: string,
  directory: string,
): typeof BocControls.Origin.Type {
  if (FSUtil.contains("/builtin", file)) return "system"
  if (
    [global.config, path.join(global.home, ".agents"), path.join(global.home, ".claude")].some((root) =>
      FSUtil.contains(root, file),
    )
  )
    return "global"
  if ([canonical, directory].some((root) => FSUtil.contains(root, file))) return "project"
  return "global"
}

function pluginOrigin(source: Plugin.Source | undefined): typeof BocControls.Origin.Type {
  return source?.type === "builtin" || source?.type === "sdk" ? "system" : "plugin"
}

function validConfiguration(content: string) {
  const errors: ParseError[] = []
  const value = parse(content, errors, { allowTrailingComma: true })
  if (errors.length || !value || typeof value !== "object" || Array.isArray(value)) return false
  return ConfigNormalize.normalize(value).type === "normalized"
}

function validSource(source: Pick<BocControls.Source, "kind" | "path">, content: string) {
  if (source.kind === "instruction") return true
  return SkillFile.parse(path.dirname(source.path), source.path, content)._tag === "Parsed"
}

function safeSourceName(name: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)
}

function formatModel(model: { providerID: string; id?: string; model?: string; variant?: string }) {
  const id = model.id ?? model.model
  return id ? `${model.providerID}/${id}${model.variant ? `#${model.variant}` : ""}` : model.providerID
}

function sourceOf(value: object) {
  const source = BocControlSource.get(value)
  return source && "file" in source ? source.file : undefined
}

function pluginSource(value: object) {
  const source = BocControlSource.get(value)
  return source && "plugin" in source
}
