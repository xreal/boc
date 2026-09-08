import { Schema } from "effect"
import { Session } from "../session.js"
import { AbsolutePath, optional } from "../schema.js"
import { Worktree } from "../worktree.js"
import { Location } from "../location.js"

export const Phase = Schema.Literals([
  "queued",
  "creating-checkout",
  "preparing-template",
  "initializing-rift",
  "creating-rift-checkout",
  "verifying-checkout",
  "starting-environment",
])
export type Phase = typeof Phase.Type

export const Status = Schema.Literals(["running", "succeeded", "failed"])
export type Status = typeof Status.Type

export interface State extends Schema.Schema.Type<typeof State> {}
export const State = Schema.Struct({
  operationID: Session.ID,
  origin: optional(Location.Ref),
  status: Status,
  phase: Phase,
  startedAt: Schema.Number,
  updatedAt: Schema.Number,
  endedAt: optional(Schema.Number),
  log: Schema.String,
  truncated: Schema.Boolean,
  directory: optional(AbsolutePath),
  error: optional(Schema.String),
}).annotate({ identifier: "BocWorktreePreparation.State" })

export interface StartInput extends Schema.Schema.Type<typeof StartInput> {}
export const StartInput = Schema.Struct({
  operationID: Session.ID,
  worktree: Worktree.CreateInput,
}).annotate({ identifier: "BocWorktreePreparation.StartInput" })
