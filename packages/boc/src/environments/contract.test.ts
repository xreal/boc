import { expect, test } from "bun:test"
import { Schema } from "effect"
import { BocEnvironment } from "@opencode/schema/boc/environment"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"

test("retains old stored run readability and omits absent operation metadata on the wire", () => {
  const run = { id: "run", action: "setup", status: "succeeded", startedAt: 0, log: "done\n", truncated: false } as const
  const decoded = Schema.decodeUnknownSync(BocEnvironment.Run)(run)
  expect(Schema.encodeSync(BocEnvironment.Run)(decoded)).toEqual(run)
  expect(Object.keys(Schema.encodeSync(BocEnvironment.Run)(decoded))).not.toContain("containerID")
})

test("requires the service-control capability protocol and validates byte offsets", () => {
  expect(Schema.is(BocEnvironmentRpc.Info)({ protocol: 1 })).toBe(false)
  expect(Schema.is(BocEnvironmentRpc.Info)({ protocol: 2 })).toBe(true)
  expect(
    Schema.is(BocEnvironment.Run)({
      id: "run",
      action: "restart",
      status: "running",
      startedAt: 0,
      log: "",
      truncated: false,
      containerID: "container",
      logStart: -1,
    }),
  ).toBe(false)
})
