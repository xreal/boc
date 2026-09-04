import { expect, test } from "bun:test"
import { BocDesktopRpcs } from "@boc/extensions/desktop/shared"
import { DesktopRpcs } from "../shared/ipc-rpc"

test("merges BOC RPCs into the desktop RPC group", () => {
  expect([...BocDesktopRpcs.requests.keys()]).toEqual([
    "BocJiraGetConnectionStatus",
    "BocJiraTestConnection",
    "BocJiraSaveConnection",
    "BocJiraDisconnect",
  ])
  expect(DesktopRpcs.requests.has("BocJiraGetConnectionStatus")).toBe(true)
  expect(DesktopRpcs.requests.has("BocJiraTestConnection")).toBe(true)
  expect(DesktopRpcs.requests.has("BocJiraSaveConnection")).toBe(true)
  expect(DesktopRpcs.requests.has("BocJiraDisconnect")).toBe(true)
})
