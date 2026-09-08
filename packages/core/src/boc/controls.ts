export * as BocProjectControls from "./controls.js"

import { BocControls } from "@opencode-ai/schema/boc/controls"
import type { Plugin } from "@opencode-ai/schema/plugin"
import type { RpcCallContext } from "@opencode-ai/plugin/effect/rpc"
import { define } from "@opencode-ai/plugin/effect/plugin"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Global } from "@opencode-ai/util/global"
import { Effect, Stream } from "effect"
import path from "path"
import { Config } from "../config.js"
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
    const disabled = (kind: BocControls.Kind, id: string) => project.policy.settings[kind][id] === false

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
        mutable: true,
      }))
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
      operations: ["info", "getState", "setEnabled", "clearOverride", "retryApply"],
    })
    const reload = (kind: BocControls.Kind) => {
      if (kind === "skill") return ctx.skill.reload()
      if (kind === "tool") return ctx.tool.reload()
      if (kind === "mcp") return ctx.mcp.reload()
      return Effect.void
    }
    const state = Effect.fn("BocProjectControls.state")(function* () {
      const agents = yield* ctx.agent.list({})
      inventory.agent = agents.data.map((agent) => ({
        id: agent.id,
        name: agent.name,
        description: agent.description ?? "",
        value: agent,
        defaultEnabled: true,
        mutable: false,
      }))
      // Transforms capture inventory. Listing and snapshotting force those transforms to run.
      yield* ctx.skill.list({})
      yield* tools.snapshot()
      const mcp = yield* ctx.mcp.list({})
      const instructions = yield* discovery.list()
      const plugins = yield* ctx.plugin.list({})
      const documents = (yield* config.entries()).filter((entry) => entry.type === "document")
      const statuses = new Map(mcp.data.map((item) => [item.name, item.status.status]))
      const incomplete: BocControls.Kind[] = Array.isArray(instructions) ? [] : ["instruction"]
      const items = BocControls.kinds.flatMap((kind) => {
        const known = new Set(inventory[kind].map((item) => item.id))
        const missing = Object.keys(project.policy.settings[kind])
          .filter((id) => !known.has(id))
          .map((id) => ({ id, name: id, description: "", defaultEnabled: true, mutable: false }))
        return [...inventory[kind], ...missing].map((item) =>
          describe({
            kind,
            item,
            present: known.has(item.id),
            policy: project.policy,
            failed,
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
    const registration = yield* ctx.rpc.register(BocControls.Rpc, {
      info: () => Effect.succeed(info()),
      getState: () => policies.lock.withPermits(1)(state().pipe(Effect.orDie)),
      setEnabled: (target, call) => mutate({ ...target, action: "set" }, call),
      clearOverride: (target, call) => mutate({ ...target, action: "clear" }, call),
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
      Stream.runForEach(() => member.changed()),
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
  incomplete: readonly BocControls.Kind[]
  status: string | undefined
  provenance: { source: string; origin: typeof BocControls.Origin.Type }
}): BocControls.Item {
  const override = input.policy.settings[input.kind][input.item.id] ?? null
  const enabled = override ?? input.item.defaultEnabled
  const unconfirmed =
    !input.present ||
    (override !== null && !input.item.mutable) ||
    input.failed.has(input.kind) ||
    input.incomplete.includes(input.kind)
  return {
    kind: input.kind,
    id: input.item.id,
    name: input.item.name,
    description: input.item.description,
    ...input.provenance,
    override,
    defaultEnabled: input.present ? input.item.defaultEnabled : null,
    mutable: input.present && input.item.mutable,
    present: input.present,
    effective: unconfirmed ? "unknown" : enabled ? "enabled" : "disabled",
    application: input.failed.has(input.kind) ? "failed" : "applied",
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
    origin: pluginOrigin(plugin?.source),
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
