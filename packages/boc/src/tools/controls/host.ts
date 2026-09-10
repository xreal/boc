import type { RpcClient } from "@opencode/client/promise/api"
import { BocControls } from "@opencode/schema/boc/controls"
export { BocControls } from "@opencode/schema/boc/controls"

export const controls = BocControls.Rpc
export type ControlState = BocControls.State
export type ControlItem = BocControls.Item
export type ControlModel = { id: string; name: string; provider: string }
export type ControlsSelection = { server: string; project: string; directory: string }
export type ControlsServer = {
  key: string
  name: string
  globalDirectories?: string[]
  projects: Array<{ directory: string; name: string; locations: string[] }>
}
export type ControlsConnection = {
  client(): RpcClient<typeof controls>
  identity(): object
  status(): string
  attempt(): number
  subscribe(changed: (event: unknown) => void): () => void
}
export type ControlsHost = {
  servers(): ControlsServer[]
  initial(): Promise<ControlsSelection | undefined>
  remember(selection: ControlsSelection): void
  connect(server: string): ControlsConnection | undefined
  openSession(): Promise<void>
  connectMcp?(selection: ControlsSelection, id: string): Promise<void>
  models?(selection: ControlsSelection, scope: BocControls.ConfigurationScope): Promise<ControlModel[]>
}
