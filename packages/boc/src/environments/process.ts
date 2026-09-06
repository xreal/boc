export type ProcessInfo = {
  readonly id: string
  readonly status: "running" | "exited"
  readonly exitCode?: number
  readonly outputTail: number
}

export type ProcessInput = {
  readonly groupID: string
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly title: string
  readonly env: Readonly<Record<string, string>>
}

export type ProcessExit = { readonly exitCode?: number; readonly finalOffset: number; readonly disconnected?: boolean }

export type ProcessObservation = {
  readonly replay: Uint8Array
  readonly replayEnd: number
  readonly truncated: boolean
  readonly done: Promise<ProcessExit>
  readonly detach: () => void
}

export interface ProcessHost {
  readonly create: (input: ProcessInput) => Promise<ProcessInfo>
  readonly get: (id: string) => Promise<ProcessInfo | undefined>
  readonly observe: (
    id: string,
    cursor: number,
    onOutput: (event: { data: Uint8Array; end: number }) => void,
  ) => Promise<ProcessObservation>
  readonly terminate: (id: string) => Promise<void>
}
