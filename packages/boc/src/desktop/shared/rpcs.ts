import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import { JiraRpcs } from "../../tools/jira/rpcs"

export {
  BocJiraDisconnect,
  BocJiraGetBoard,
  BocJiraGetConnectionStatus,
  BocJiraGetIssue,
  BocJiraGetPreferences,
  BocJiraListBoards,
  BocJiraListIssues,
  BocJiraSaveConnection,
  BocJiraSavePreferences,
  BocJiraTestConnection,
  JiraConnectionAttempt,
  JiraConnectionInput,
  JiraConnectionStatus,
  JiraErrorCategory,
  JiraRpcs,
} from "../../tools/jira/rpcs"

export const BocDesktopRpcs = JiraRpcs
export type BocDesktopRpcClient = RpcClient.FromGroup<typeof BocDesktopRpcs, RpcClientError.RpcClientError>
