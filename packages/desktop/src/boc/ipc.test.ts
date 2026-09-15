import { expect, test } from "bun:test"
import { BocDesktopRpcs } from "@boc/extensions/desktop/shared"
import { DesktopRpcs } from "../shared/ipc-rpc"

const jiraTags = [
  "BocJiraListBranches",
  "BocJiraPreviewAttachment",
  "BocJiraDownloadAttachment",
  "BocJiraListComments",
  "BocJiraSearchAssignees",
  "BocJiraAssignIssue",
  "BocJiraListPullRequests",
  "BocJiraCancelIssueResourceRead",
  "BocJiraGetSessionInstructions",
  "BocJiraSaveSessionInstructions",
  "BocJiraListSessionLinks",
  "BocJiraListSessionCounts",
  "BocJiraSaveSessionLink",
  "BocJiraPromoteSessionLink",
  "BocJiraGetConnectionStatus",
  "BocJiraTestConnection",
  "BocJiraSaveConnection",
  "BocJiraDisconnect",
  "BocJiraListBoards",
  "BocJiraGetBoard",
  "BocJiraListIssues",
  "BocJiraSearchIssues",
  "BocJiraGetIssue",
  "BocJiraListIssueStatuses",
  "BocJiraCancelBoardRead",
  "BocJiraCancelIssueRead",
  "BocJiraGetPreferences",
  "BocJiraSavePreferences",
] as const

const deploymentTags = [
  "BocDeploymentsGetWorkspace",
  "BocDeploymentsListSystems",
  "BocDeploymentsCancelSystemsRead",
  "BocDeploymentsGetSettings",
  "BocDeploymentsSaveSettings",
  "BocDeploymentsCheckReadiness",
  "BocDeploymentsListBranches",
  "BocDeploymentsListWorkflowTargets",
  "BocDeploymentsListOperations",
  "BocDeploymentsPrepareDeployment",
  "BocDeploymentsDispatchPrepared",
  "BocDeploymentsPrepareReset",
  "BocDeploymentsDispatchPreparedReset",
  "BocDeploymentsRedeployBranch",
  "BocDeploymentsSetAutoSync",
  "BocDeploymentsGetCacheRun",
  "BocDeploymentsStartCacheRun",
  "BocDeploymentsResolveCacheRun",
] as const

test("merges BOC RPCs into the desktop RPC group", () => {
  const tags = [
    ...jiraTags,
    ...deploymentTags,
  ]
  expect([...BocDesktopRpcs.requests.keys()]).toEqual(tags)
  for (const tag of tags) {
    expect(DesktopRpcs.requests.has(tag)).toBe(true)
  }
})
