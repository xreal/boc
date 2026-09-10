import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createEnvironmentStore } from "./store"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

test("decodes only version 2 environment records", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "boc-environment-store-"))
  cleanup.push(directory)
  const store = createEnvironmentStore(directory)
  const record = {
    version: 2 as const,
    backend: "local" as const,
    projectID: "project",
    directory: "/checkout",
    owner: { token: "token", gitDirectory: "/git" },
  }

  await store.write(record)
  expect(await store.read("project", "/checkout")).toEqual(record)

  const files = await fs.readdir(directory)
  await Bun.write(path.join(directory, files[0]), JSON.stringify({ ...record, version: 1 }))
  expect(await createEnvironmentStore(directory).read("project", "/checkout")).toBeUndefined()
})
