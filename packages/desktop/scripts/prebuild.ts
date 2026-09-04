#!/usr/bin/env bun
import { $ } from "bun"
import { rm } from "node:fs/promises"

import { resolveRiftTarget } from "../../boc/scripts/rift/target"
import { copyBuiltCliToResources, downloadCliToResources, getCurrentCli, resolveChannel } from "./utils"

const channel = resolveChannel()
if ((channel === "boc" || channel === "prod") && !Bun.env.OPENCODE_CLI_DIST) {
  throw new Error(`OPENCODE_CLI_DIST is required for ${channel} desktop builds`)
}

await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

if (channel === "dev") await downloadCliToResources()
if ((channel === "beta" || channel === "boc" || channel === "prod") && Bun.env.OPENCODE_CLI_DIST) {
  await copyBuiltCliToResources(Bun.env.OPENCODE_CLI_DIST)
}
if (channel === "beta" && !Bun.env.OPENCODE_CLI_DIST) await downloadCliToResources("beta")

await rm("resources/rift", { recursive: true, force: true })
if (channel === "boc") {
  const cli = getCurrentCli()
  const target = resolveRiftTarget(cli.os, cli.cpu)
  if (target) await $`bun ../boc/scripts/rift/fetch.ts ${target} ${"resources/rift/rift"}`
}
