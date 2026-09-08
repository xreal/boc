import type { OpenCodeClient } from "@opencode-ai/client/promise"
import { BocEnvironmentRpc } from "@opencode-ai/schema/boc/environment-rpc"
import type { BocEnvironment } from "@opencode-ai/schema/boc/environment"

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
      domain?: string
      confirmation?: "remove-environment"
    }) => rpc.run(input, { location: { directory: input.directory } }),
    cancel: (input: { projectID: string; directory: string }) =>
      rpc.cancel(input, { location: { directory: input.directory } }),
  }
}
