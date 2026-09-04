import type { Effect } from "effect"
import type { BocDesktopRpcClient } from "../shared/rpcs"

type BocDesktopRpcTag = keyof BocDesktopRpcClient
type BocDesktopInvokeArgs<Tag extends BocDesktopRpcTag> = Parameters<BocDesktopRpcClient[Tag]>
type BocDesktopInvokeResult<Tag extends BocDesktopRpcTag> =
  ReturnType<BocDesktopRpcClient[Tag]> extends Effect.Effect<infer Value, unknown> ? Value : never

export type BocDesktopInvoke = <Tag extends BocDesktopRpcTag>(
  tag: Tag,
  ...payload: BocDesktopInvokeArgs<Tag>
) => Promise<BocDesktopInvokeResult<Tag>>

export function createBocDesktopAPI(invoke: BocDesktopInvoke) {
  return {
    jira: {
      getConnectionStatus: () => invoke("BocJiraGetConnectionStatus"),
      testConnection: (input: BocDesktopInvokeArgs<"BocJiraTestConnection">[0]) =>
        invoke("BocJiraTestConnection", input),
      saveConnection: (input: BocDesktopInvokeArgs<"BocJiraSaveConnection">[0]) =>
        invoke("BocJiraSaveConnection", input),
      disconnect: () => invoke("BocJiraDisconnect"),
      listBoards: (input: BocDesktopInvokeArgs<"BocJiraListBoards">[0]) => invoke("BocJiraListBoards", input),
      getBoard: (input: BocDesktopInvokeArgs<"BocJiraGetBoard">[0]) => invoke("BocJiraGetBoard", input),
      listIssues: (input: BocDesktopInvokeArgs<"BocJiraListIssues">[0]) => invoke("BocJiraListIssues", input),
      getIssue: (input: BocDesktopInvokeArgs<"BocJiraGetIssue">[0]) => invoke("BocJiraGetIssue", input),
      cancelBoardRead: (input: BocDesktopInvokeArgs<"BocJiraCancelBoardRead">[0]) =>
        invoke("BocJiraCancelBoardRead", input),
      cancelIssueRead: (input: BocDesktopInvokeArgs<"BocJiraCancelIssueRead">[0]) =>
        invoke("BocJiraCancelIssueRead", input),
      getPreferences: () => invoke("BocJiraGetPreferences"),
      savePreferences: (input: BocDesktopInvokeArgs<"BocJiraSavePreferences">[0]) =>
        invoke("BocJiraSavePreferences", input),
    },
  }
}

export type BocDesktopAPI = ReturnType<typeof createBocDesktopAPI>
