import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { claimTemplateRoot } from "./metadata"

describe("Rift template ownership", () => {
  test("reuses only a template root claimed for the same source", async () => {
    const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-owner-")))
    const root = path.join(fixture, ".boc-rift", "source-key")

    try {
      expect(await claimTemplateRoot(root, "/repositories/one")).toBe(true)
      expect(await claimTemplateRoot(root, "/repositories/one")).toBe(true)
      expect(await claimTemplateRoot(root, "/repositories/two")).toBe(false)
    } finally {
      await fs.rm(fixture, { recursive: true, force: true })
    }
  })

  test("does not follow a symlinked template root", async () => {
    const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "boc-rift-owner-")))
    const target = path.join(fixture, "target")
    const root = path.join(fixture, ".boc-rift", "source-key")

    try {
      await fs.mkdir(path.dirname(root), { recursive: true })
      await fs.mkdir(target)
      await fs.symlink(target, root)
      expect(await claimTemplateRoot(root, "/repositories/one")).toBe(false)
    } finally {
      await fs.rm(fixture, { recursive: true, force: true })
    }
  })
})
