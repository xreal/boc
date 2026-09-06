import path from "node:path"

export function bocServiceFile(input: { home: string; state?: string }) {
  const state = input.state || path.join(input.home, ".local", "state")
  return path.join(state, "opencode", "service-boc.json")
}
