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
    worktrees: {
      getDefault: () => invoke("BocWorktreesGetDefault"),
      setDefault: (input: BocDesktopInvokeArgs<"BocWorktreesSetDefault">[0]) => invoke("BocWorktreesSetDefault", input),
      getProject: (input: BocDesktopInvokeArgs<"BocWorktreesGetProject">[0]) => invoke("BocWorktreesGetProject", input),
      setProject: (input: BocDesktopInvokeArgs<"BocWorktreesSetProject">[0]) => invoke("BocWorktreesSetProject", input),
    },
    deployments: {
      getWorkspace: () => invoke("BocDeploymentsGetWorkspace"),
      listSystems: (input: BocDesktopInvokeArgs<"BocDeploymentsListSystems">[0]) =>
        invoke("BocDeploymentsListSystems", input),
      cancelSystemsRead: (input: BocDesktopInvokeArgs<"BocDeploymentsCancelSystemsRead">[0]) =>
        invoke("BocDeploymentsCancelSystemsRead", input),
      getSettings: () => invoke("BocDeploymentsGetSettings"),
      saveSettings: (input: BocDesktopInvokeArgs<"BocDeploymentsSaveSettings">[0]) =>
        invoke("BocDeploymentsSaveSettings", input),
      checkReadiness: () => invoke("BocDeploymentsCheckReadiness"),
      listBranches: (input: BocDesktopInvokeArgs<"BocDeploymentsListBranches">[0]) =>
        invoke("BocDeploymentsListBranches", input),
      listWorkflowTargets: (input: BocDesktopInvokeArgs<"BocDeploymentsListWorkflowTargets">[0]) =>
        invoke("BocDeploymentsListWorkflowTargets", input),
      listOperations: () => invoke("BocDeploymentsListOperations"),
      prepareDeployment: (input: BocDesktopInvokeArgs<"BocDeploymentsPrepareDeployment">[0]) =>
        invoke("BocDeploymentsPrepareDeployment", input),
      dispatchPrepared: (input: BocDesktopInvokeArgs<"BocDeploymentsDispatchPrepared">[0]) =>
        invoke("BocDeploymentsDispatchPrepared", input),
      prepareReset: (input: BocDesktopInvokeArgs<"BocDeploymentsPrepareReset">[0]) =>
        invoke("BocDeploymentsPrepareReset", input),
      dispatchPreparedReset: (input: BocDesktopInvokeArgs<"BocDeploymentsDispatchPreparedReset">[0]) =>
        invoke("BocDeploymentsDispatchPreparedReset", input),
      redeployBranch: (input: BocDesktopInvokeArgs<"BocDeploymentsRedeployBranch">[0]) =>
        invoke("BocDeploymentsRedeployBranch", input),
      setAutoSync: (input: BocDesktopInvokeArgs<"BocDeploymentsSetAutoSync">[0]) =>
        invoke("BocDeploymentsSetAutoSync", input),
    },
    jira: {
      getSessionInstructions: () => invoke("BocJiraGetSessionInstructions"),
      saveSessionInstructions: (input: BocDesktopInvokeArgs<"BocJiraSaveSessionInstructions">[0]) =>
        invoke("BocJiraSaveSessionInstructions", input),
      listSessionLinks: (input: BocDesktopInvokeArgs<"BocJiraListSessionLinks">[0]) =>
        invoke("BocJiraListSessionLinks", input),
      saveSessionLink: (input: BocDesktopInvokeArgs<"BocJiraSaveSessionLink">[0]) =>
        invoke("BocJiraSaveSessionLink", input),
      promoteSessionLink: (input: BocDesktopInvokeArgs<"BocJiraPromoteSessionLink">[0]) =>
        invoke("BocJiraPromoteSessionLink", input),
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
