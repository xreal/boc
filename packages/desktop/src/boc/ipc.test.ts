import { expect, test } from "bun:test"
import { BocDesktopRpcs } from "@boc/extensions/desktop/shared"
import { DesktopRpcs } from "../shared/ipc-rpc"

const jiraTags = [
  "BocJiraListSessionLinks",
  "BocJiraSaveSessionLink",
  "BocJiraPromoteSessionLink",
  "BocJiraGetConnectionStatus",
  "BocJiraTestConnection",
  "BocJiraSaveConnection",
  "BocJiraDisconnect",
  "BocJiraListBoards",
  "BocJiraGetBoard",
  "BocJiraListIssues",
  "BocJiraGetIssue",
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
] as const

test("merges BOC RPCs into the desktop RPC group", () => {
  const tags = [
    ...jiraTags,
    ...deploymentTags,
    "BocWorktreesGetDefault",
    "BocWorktreesSetDefault",
    "BocWorktreesGetProject",
    "BocWorktreesSetProject",
  ]
  expect([...BocDesktopRpcs.requests.keys()]).toEqual(tags)
  for (const tag of tags) {
    expect(DesktopRpcs.requests.has(tag)).toBe(true)
  }
})
