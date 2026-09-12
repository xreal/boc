import { RpcClient, RpcClientError } from "effect/unstable/rpc"
import { DeploymentRpcs } from "../../tools/deployments/rpcs"
import { JiraRpcs } from "../../tools/jira/rpcs"

export {
  BocDeploymentsCancelSystemsRead,
  BocDeploymentsCheckReadiness,
  BocDeploymentsDispatchPrepared,
  BocDeploymentsDispatchPreparedReset,
  BocDeploymentsGetSettings,
  BocDeploymentsGetCacheRun,
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
  BocDeploymentsStartCacheRun,
  BocDeploymentsResolveCacheRun,
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
  BocJiraListIssueStatuses,
  BocJiraSaveConnection,
  BocJiraSavePreferences,
  BocJiraTestConnection,
  JiraConnectionAttempt,
  JiraConnectionInput,
  JiraConnectionStatus,
  JiraErrorCategory,
  JiraRpcs,
} from "../../tools/jira/rpcs"

export const BocDesktopRpcs = JiraRpcs.merge(DeploymentRpcs)
export type BocDesktopRpcClient = RpcClient.FromGroup<typeof BocDesktopRpcs, RpcClientError.RpcClientError>
