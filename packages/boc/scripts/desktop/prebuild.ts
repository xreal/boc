import { prepareBocIcons, stageBocCli } from "./resources"

export async function prepareBocBuild() {
  const root = process.env.OPENCODE_CLI_DIST
  if (!root) throw new Error("OPENCODE_CLI_DIST is required for boc desktop builds")
  await prepareBocIcons(false)
  await stageBocCli(root)
}

if (import.meta.main) await prepareBocBuild()
