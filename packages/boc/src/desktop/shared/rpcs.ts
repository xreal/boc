import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import { JiraRpcs } from "../../tools/jira/rpcs"

export { BocJiraGetConnectionStatus, JiraConnectionStatus, JiraRpcs } from "../../tools/jira/rpcs"

export const BocDesktopRpcs = JiraRpcs
export type BocDesktopRpcClient = RpcClient.FromGroup<typeof BocDesktopRpcs, RpcClientError.RpcClientError>
