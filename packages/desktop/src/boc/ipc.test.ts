import { expect, test } from "bun:test"
import { BocDesktopRpcs } from "@boc/extensions/desktop/shared"
import { DesktopRpcs } from "../shared/ipc-rpc"

const jiraTags = [
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

test("merges BOC RPCs into the desktop RPC group", () => {
  expect([...BocDesktopRpcs.requests.keys()]).toEqual([...jiraTags])
  for (const tag of jiraTags) {
    expect(DesktopRpcs.requests.has(tag)).toBe(true)
  }
})
