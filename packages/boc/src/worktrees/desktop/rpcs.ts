import { Project } from "@opencode/schema/project"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const WorktreeBackend = Schema.Literals(["git", "rift"])
export type WorktreeBackend = typeof WorktreeBackend.Type

export const WorktreeDefaultPreference = Schema.Struct({ defaultBackend: WorktreeBackend })
export type WorktreeDefaultPreference = typeof WorktreeDefaultPreference.Type

export const WorktreeProjectScope = Schema.Struct({
  server: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  projectID: Project.ID,
})
export type WorktreeProjectScope = typeof WorktreeProjectScope.Type

export const WorktreeProjectPreference = Schema.Struct({ backend: Schema.optionalKey(WorktreeBackend) })
export type WorktreeProjectPreference = typeof WorktreeProjectPreference.Type

export const WorktreeProjectPreferenceUpdate = Schema.Struct({
  server: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2_048)),
  projectID: Project.ID,
  backend: Schema.optionalKey(WorktreeBackend),
})

export const BocWorktreesGetDefault = Rpc.make("BocWorktreesGetDefault", {
  success: WorktreeDefaultPreference,
})

export const BocWorktreesSetDefault = Rpc.make("BocWorktreesSetDefault", {
  payload: WorktreeDefaultPreference,
  success: WorktreeDefaultPreference,
})

export const BocWorktreesGetProject = Rpc.make("BocWorktreesGetProject", {
  payload: WorktreeProjectScope,
  success: WorktreeProjectPreference,
})

export const BocWorktreesSetProject = Rpc.make("BocWorktreesSetProject", {
  payload: WorktreeProjectPreferenceUpdate,
  success: WorktreeProjectPreference,
})

export const WorktreePreferenceRpcs = RpcGroup.make(
  BocWorktreesGetDefault,
  BocWorktreesSetDefault,
  BocWorktreesGetProject,
  BocWorktreesSetProject,
)
