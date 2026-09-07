import { expect, test } from "bun:test"
import { bocServiceFile, isBocSourceBackend } from "./development"
import { join } from "node:path"

test("recognizes the standard local dev launch after Electron maps its channel to dev", () => {
  expect(isBocSourceBackend("dev", { OPENCODE_CHANNEL: "local", OPENCODE_DESKTOP_CLI_DEV: "packages/cli" })).toBe(true)
  expect(isBocSourceBackend("dev", { OPENCODE_CHANNEL: "local" })).toBe(false)
  expect(isBocSourceBackend("beta", { OPENCODE_DESKTOP_CLI_DEV: "packages/cli" })).toBe(false)
  expect(isBocSourceBackend("boc", { OPENCODE_DESKTOP_CLI_DEV: "packages/cli" })).toBe(true)
})

test("discovers the registration written by the Boc backend in local desktop development", () => {
  const environment = { OPENCODE_CHANNEL: "local", OPENCODE_DESKTOP_CLI_DEV: "packages/cli" }
  expect(bocServiceFile("dev", "profile", environment)).toBe(join("profile", "opencode", "service.json"))
  expect(bocServiceFile("boc", "profile", {})).toBe(join("profile", "opencode", "service.json"))
  expect(bocServiceFile("dev", "profile", { OPENCODE_CHANNEL: "local" })).toBeUndefined()
})
