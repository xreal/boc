export * as WorktreeProgress from "./worktree-progress.js"

import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@opencode-ai/util/process"

export type Phase =
  | "creating-checkout"
  | "preparing-template"
  | "initializing-rift"
  | "creating-rift-checkout"
  | "verifying-checkout"
  | "starting-environment"

export interface Reporter {
  readonly phase: (phase: Phase) => void
  readonly output: (value: string) => void
}

export function runSetup(processes: AppProcess.Interface, command: ChildProcess.Command, progress?: Reporter) {
  if (!progress) return processes.run(command).pipe(Effect.flatMap(AppProcess.requireSuccess))
  progress.phase("starting-environment")
  return processes
    .runStream(command, { includeStderr: true, okExitCodes: [0] })
    .pipe(Stream.runForEach((line) => Effect.sync(() => progress.output(`${line}\n`))))
}
