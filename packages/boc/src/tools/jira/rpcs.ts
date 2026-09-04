import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/unstable/rpc"

export const JiraConnectionStatus = Schema.Struct({
  status: Schema.Literal("not-configured"),
})
export type JiraConnectionStatus = typeof JiraConnectionStatus.Type

export const BocJiraGetConnectionStatus = Rpc.make("BocJiraGetConnectionStatus", {
  success: JiraConnectionStatus,
})

export const JiraRpcs = RpcGroup.make(BocJiraGetConnectionStatus)
