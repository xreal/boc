import { describe, expect, test } from "bun:test"
import { BocDesktopRpcs } from "./desktop/shared/rpcs"
import { bocExtensions, type BocExtension } from "./registry"
import { exampleExtension } from "./tools/__fixtures__/example/extension"

describe("BOC extension registry", () => {
  test("registers Jira and Deployments through the generic extension seam", () => {
    expect(bocExtensions.map((extension) => extension.id)).toEqual(["jira", "deployments"])
    expect(bocExtensions.every((extension) => extension.desktopOnly)).toBe(true)
  })

  test("keeps extension and command ids unique", () => {
    const extensions: readonly BocExtension[] = [...bocExtensions, exampleExtension]
    const extensionIds = extensions.map((extension) => extension.id)
    const commandIds = extensions.flatMap((extension) => [
      `boc.${extension.id}.open`,
      ...(extension.commands?.map((command) => command.id) ?? []),
    ])

    expect(new Set(extensionIds).size).toBe(extensionIds.length)
    expect(new Set(commandIds).size).toBe(commandIds.length)
  })

  test("prefixes every desktop RPC tag with Boc", () => {
    expect([...BocDesktopRpcs.requests.keys()]).not.toHaveLength(0)
    expect([...BocDesktopRpcs.requests.keys()].every((tag) => tag.startsWith("Boc"))).toBe(true)
  })
})
