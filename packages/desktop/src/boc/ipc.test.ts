import { expect, test } from "bun:test"
import { BocDesktopRpcs } from "@boc/extensions/desktop/shared"
import { DesktopRpcs } from "../shared/ipc-rpc"

test("merges BOC RPCs into the desktop RPC group", () => {
  expect([...BocDesktopRpcs.requests.keys()]).toEqual(["BocJiraGetConnectionStatus"])
  expect(DesktopRpcs.requests.has("BocJiraGetConnectionStatus")).toBe(true)
})
