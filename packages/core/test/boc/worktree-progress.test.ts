import { describe, expect } from "bun:test"
import { WorktreeProgress } from "@opencode/core/boc/worktree-progress"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppProcess } from "@opencode/util/process"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

describe("worktree progress", () => {
  it.live("streams setup output through an optional reporter", () =>
    Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const phases: WorktreeProgress.Phase[] = []
      const output: string[] = []

      yield* WorktreeProgress.runSetup(
        processes,
        ChildProcess.make(process.execPath, ["-e", 'console.log("environment ready"); console.error("stack ready")']),
        {
          phase: (phase) => phases.push(phase),
          output: (value) => output.push(value),
        },
      )

      expect(phases).toEqual(["starting-environment"])
      expect(output).toContain("environment ready\n")
      expect(output).toContain("stack ready\n")
    }),
  )
})
