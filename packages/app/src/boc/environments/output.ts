import type { BocEnvironment } from "@opencode/schema/boc/environment"

export function createEnvironmentOutputCursor() {
  let id: string | undefined
  let end = 0
  return (run: Pick<BocEnvironment.Run, "id" | "log" | "logStart">) => {
    const bytes = new TextEncoder().encode(run.log)
    const start = run.logStart ?? 0
    const next = start + bytes.byteLength
    const reset = id !== run.id || start > end || next < end
    const data = new TextDecoder().decode(bytes.subarray(reset ? 0 : Math.max(0, end - start)))
    id = run.id
    end = next
    return { reset, data }
  }
}
