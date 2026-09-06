import { expect, test } from "bun:test"
import path from "node:path"
import { bocServiceFile } from "./service"

test("uses the CLI's default Boc service registration", () => {
  expect(bocServiceFile({ home: "/Users/example" })).toBe(
    path.join("/Users/example", ".local", "state", "opencode", "service-boc.json"),
  )
})

test("respects the CLI's XDG state directory", () => {
  expect(bocServiceFile({ home: "/Users/example", state: "/var/state" })).toBe(
    path.join("/var/state", "opencode", "service-boc.json"),
  )
})
