import type { OpenCodeClient } from "@opencode/client/promise"
import { BocEnvironmentRpc } from "@opencode/schema/boc/environment-rpc"
import type { BocEnvironment } from "@opencode/schema/boc/environment"

export function environmentApi(api: Pick<OpenCodeClient, "rpc">) {
  const rpc = api.rpc(BocEnvironmentRpc.Rpc)
  return {
    inspect: (input: { projectID: string; directory: string }) =>
      rpc.inspect(input, { location: { directory: input.directory } }),
    run: (input: {
      projectID: string
      directory: string
      sessionID: string
      action: BocEnvironment.Action
      containerID?: string
      domain?: string
      confirmation?: "remove-environment"
    }) => rpc.run(input, { location: { directory: input.directory } }),
    cancel: (input: { projectID: string; directory: string }) =>
      rpc.cancel(input, { location: { directory: input.directory } }),
    logs: (input: { projectID: string; directory: string; containerID: string }) =>
      rpc.logs(input, { location: { directory: input.directory } }),
    resize: (input: { projectID: string; directory: string; runID: string; cols: number; rows: number }) =>
      rpc.resize(input, { location: { directory: input.directory } }),
  }
}
