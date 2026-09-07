import type { Effect, Scope } from "effect"
import type { Registration } from "../effect/registration.js"

export interface InstructionCandidate {
  readonly id: string
  readonly path: string
  readonly source: "project" | "global" | "unknown"
}

export interface InstructionSelection {
  /** Use this snapshot directly. Calling listInstructions from this callback is recursive. */
  readonly candidates: ReadonlyArray<InstructionCandidate>
  readonly exclude: (id: string) => void
}

export interface InstructionInventory {
  readonly available: boolean
  readonly sources: ReadonlyArray<InstructionCandidate>
}

export interface EffectDomain {
  readonly version: 1
  readonly hook: (
    name: "instructions",
    callback: (event: InstructionSelection) => Effect.Effect<void>,
  ) => Effect.Effect<Registration, never, Scope.Scope>
  readonly listInstructions: () => Effect.Effect<InstructionInventory>
}

export interface PromiseDomain {
  readonly version: 1
  readonly hook: (
    name: "instructions",
    callback: (event: InstructionSelection) => Promise<void> | void,
  ) => Promise<{ readonly dispose: () => Promise<void> }>
  readonly listInstructions: () => Promise<InstructionInventory>
}
