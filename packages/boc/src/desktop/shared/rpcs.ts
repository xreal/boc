import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import { DeploymentRpcs } from "../../tools/deployments/rpcs"
import { JiraRpcs } from "../../tools/jira/rpcs"
import { WorktreePreferenceRpcs } from "../../worktrees/desktop/rpcs"

export {
  BocWorktreesGetDefault,
  BocWorktreesGetProject,
  BocWorktreesSetDefault,
  BocWorktreesSetProject,
  WorktreeBackend,
  WorktreeDefaultPreference,
  WorktreePreferenceRpcs,
  WorktreeProjectPreference,
  WorktreeProjectScope,
} from "../../worktrees/desktop/rpcs"

export {
  BocDeploymentsCancelSystemsRead,
  BocDeploymentsCheckReadiness,
  BocDeploymentsDispatchPrepared,
  BocDeploymentsDispatchPreparedReset,
  BocDeploymentsGetSettings,
  BocDeploymentsGetWorkspace,
  BocDeploymentsListBranches,
  BocDeploymentsListOperations,
  BocDeploymentsListSystems,
  BocDeploymentsListWorkflowTargets,
  BocDeploymentsPrepareDeployment,
  BocDeploymentsPrepareReset,
  BocDeploymentsRedeployBranch,
  BocDeploymentsSaveSettings,
  BocDeploymentsSetAutoSync,
  DeploymentRpcs,
} from "../../tools/deployments/rpcs"

export {
  BocJiraDisconnect,
  BocJiraCancelBoardRead,
  BocJiraCancelIssueRead,
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

export const BocDesktopRpcs = JiraRpcs.merge(DeploymentRpcs).merge(WorktreePreferenceRpcs)
export type BocDesktopRpcClient = RpcClient.FromGroup<typeof BocDesktopRpcs, RpcClientError.RpcClientError>
