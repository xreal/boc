import assert from "node:assert/strict"
import { resolveConfig } from "vite"
import { RendererConfigFactory } from "electron-vite"
import config from "../../electron.vite.config.ts"

// Run in a fresh process: upstream reads OPENCODE_CHANNEL at module load time.
const channel = process.env.OPENCODE_CHANNEL ?? "dev"
const command = process.argv[2] === "serve" ? "serve" : "build"
const desktop = config({ command, mode: command === "build" ? "production" : "development" })
const renderer = await new RendererConfigFactory(desktop.renderer, { configFile: false }, {}).build()
const resolved = await resolveConfig({ ...renderer, configFile: false }, command)
const expected = channel === "boc" ? "beta" : channel === "latest" ? "prod" : channel
assert.equal(resolved.define["import.meta.env.VITE_OPENCODE_CHANNEL"], JSON.stringify(expected))
assert.equal(
  resolved.define["import.meta.env.VITE_BOC_PRODUCT"],
  JSON.stringify(channel === "boc" ? "boc" : channel === "local" ? "boc-dev" : ""),
)
assert.equal(
  desktop.main.define["import.meta.env.OPENCODE_CHANNEL"],
  JSON.stringify(channel === "local" ? "dev" : expected === "beta" && channel === "boc" ? "boc" : expected),
)
console.log(
  `${command}: ${channel} → renderer=${expected}, product=${resolved.define["import.meta.env.VITE_BOC_PRODUCT"]}, main=${desktop.main.define["import.meta.env.OPENCODE_CHANNEL"]}`,
)
