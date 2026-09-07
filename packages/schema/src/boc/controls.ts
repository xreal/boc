export * as BocControls from "./controls.js"

import { Schema } from "effect"
import { optional } from "../schema.js"

export const Kind = Schema.Literals(["agent", "skill", "tool", "mcp", "instruction"])
export type Kind = typeof Kind.Type
export const kinds = Kind.literals
const Overrides = Schema.Record(Schema.String, Schema.Boolean)
export const Settings = Schema.Struct({
  agent: Overrides,
  skill: Overrides,
  tool: Overrides,
  mcp: Overrides,
  instruction: Overrides,
})
export const Policy = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settings: Settings,
})
export interface Policy extends Schema.Schema.Type<typeof Policy> {}
export const Origin = Schema.Literals(["system", "global", "project", "plugin"])
export const Info = Schema.Struct({
  protocol: Schema.Literal(1),
  version: Schema.String,
  project: Schema.Struct({ id: Schema.String, canonical: Schema.String }),
  location: Schema.Struct({ directory: Schema.String, workspaceID: optional(Schema.String) }),
  source: Schema.Literals(["bundled", "package", "local", "unknown"]),
  scope: Schema.Literal("project-on-server"),
  categories: Schema.Array(Kind),
  operations: Schema.Array(Schema.String),
})
export const Item = Schema.Struct({
  kind: Kind,
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  source: Schema.String,
  origin: optional(Origin),
  override: Schema.NullOr(Schema.Boolean),
  defaultEnabled: Schema.NullOr(Schema.Boolean),
  effective: Schema.Literals(["enabled", "disabled", "unknown"]),
  application: Schema.Literals(["applied", "pending", "failed"]),
  mutable: Schema.Boolean,
  present: Schema.Boolean,
  availability: Schema.Literals(["available", "disabled", "pending", "needs_auth", "failed", "unknown"]),
  reason: optional(
    Schema.Literals([
      "read_only",
      "unsupported",
      "unavailable",
      "apply_failed",
      "unconfirmed_policy",
      "observed_tools",
    ]),
  ),
  effect: Schema.Literals([
    "next_model_request",
    "next_instruction_request",
    "next_skill_request",
    "mcp_reconnect",
    "read_only",
  ]),
})
export interface Item extends Schema.Schema.Type<typeof Item> {}
export const State = Schema.Struct({
  info: Info,
  revision: Schema.Number,
  items: Schema.Array(Item),
  incomplete: Schema.Array(Kind),
})
export interface State extends Schema.Schema.Type<typeof State> {}
const Target = Schema.Struct({
  kind: Kind,
  id: Schema.String.check(Schema.isMinLength(1)),
  expectedRevision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
const schema = Schema.toStandardSchemaV1
const errors = {
  conflict: schema(Schema.Struct({ revision: Schema.Number })),
  unknown_capability: schema(Schema.Struct({})),
  not_supported: schema(Schema.Struct({})),
  not_ready: schema(Schema.Struct({ committed: optional(Schema.Boolean), revision: optional(Schema.Number) })),
  persistence_failed: schema(Schema.Struct({})),
}
export const Rpc = {
  id: "boc.controls.v1",
  methods: {
    info: { input: schema(Schema.Struct({})), output: schema(Info) },
    getState: { input: schema(Schema.Struct({})), output: schema(State), errors },
    setEnabled: {
      input: schema(Schema.Struct({ ...Target.fields, enabled: Schema.Boolean })),
      output: schema(State),
      errors,
    },
    clearOverride: { input: schema(Target), output: schema(State), errors },
    retryApply: { input: schema(Target), output: schema(State), errors },
  },
  events: { changed: { schema: schema(Schema.Struct({ projectID: Schema.String, revision: Schema.Number })) } },
}
