import type { RpcClient } from "@opencode-ai/client/promise/api"
import { controls } from "@bergflow/opencode/rpc"

export { controls }
export type { ControlState } from "@bergflow/opencode/rpc"
export type BergflowSelection = { server: string; project: string; directory: string }
export type BergflowServer = {
  key: string
  name: string
  projects: Array<{ directory: string; name: string; locations: string[] }>
}
export type BergflowConnection = {
  client(): RpcClient<typeof controls>
  identity(): object
  status(): string
  attempt(): number
  diagnose?(directory: string, signal: AbortSignal): Promise<string | undefined>
  subscribe(changed: (event: unknown) => void): () => void
}
export type BergflowHost = {
  servers(): BergflowServer[]
  initial(): Promise<BergflowSelection | undefined>
  remember(selection: BergflowSelection): void
  connect(server: string): BergflowConnection | undefined
  openSession(): Promise<void>
}
