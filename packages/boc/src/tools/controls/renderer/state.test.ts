import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { ControlState } from "../host"
import type { ControlsHost } from "../host"
import { createProjectControls } from "./state"

function snapshot(directory: string): ControlState {
  return {
    info: {
      protocol: 2,
      version: "0.2.1",
      project: { id: directory, canonical: directory },
      location: { directory },
      source: "local",
      scope: "project-on-server",
      categories: ["tool"],
      operations: ["info", "getState", "setEnabled", "clearOverride", "retryApply"],
    },
    revision: 0,
    incomplete: [],
    items: [
      {
        kind: "tool",
        id: "read",
        name: "Read",
        description: "",
        source: "OpenCode",
        override: null,
        defaultEnabled: true,
        effective: "enabled",
        application: "applied",
        mutable: true,
        present: true,
        availability: "available",
        effect: "next_model_request",
      },
    ],
  }
}
const flush = async () => {
  await Bun.sleep(0)
  await Bun.sleep(0)
}
function fixture(read: (directory: string) => Promise<ControlState>, write: () => Promise<ControlState>) {
  return createRoot((dispose) => {
    const [status, setStatus] = createSignal("connected")
    const identity = {}
    const client = {
      info: async (_: unknown, options: { location: { directory: string } }) =>
        snapshot(options.location.directory).info,
      getState: async (_: unknown, options: { location: { directory: string } }) => read(options.location.directory),
      setEnabled: write,
    }
    const host = {
      servers: () => [],
      initial: async () => undefined,
      remember: () => {},
      openSession: async () => {},
      connect: () => ({
        client: () => client,
        identity: () => identity,
        status,
        attempt: () => 0,
        subscribe: () => () => {},
      }),
    } as unknown as ControlsHost
    const control = createProjectControls(host)
    return { control, dispose, setStatus }
  })
}

test("discards a delayed response after an explicit context switch", async () => {
  let complete: (state: ControlState) => void = () => {}
  const delayed = new Promise<ControlState>((resolve) => {
    complete = resolve
  })
  const fixtureState = fixture(
    (directory) => (directory === "/first" ? delayed : Promise.resolve(snapshot(directory))),
    async () => snapshot("/first"),
  )
  try {
    fixtureState.control.select({ server: "remote", project: "/first", directory: "/first" })
    await flush()
    fixtureState.control.select({ server: "remote", project: "/second", directory: "/second" })
    await flush()
    complete(snapshot("/first"))
    await flush()
    expect(fixtureState.control.view.snapshot?.info.project.id).toBe("/second")
  } finally {
    fixtureState.dispose()
  }
})

test("uses the main checkout for every project selection", async () => {
  const directories: string[] = []
  const fixtureState = fixture(
    async (directory) => {
      directories.push(directory)
      return snapshot(directory)
    },
    async () => snapshot("/project"),
  )
  try {
    fixtureState.control.select({ server: "remote", project: "/project", directory: "/project/worktree" })
    await flush()
    expect(fixtureState.control.view.selection?.directory).toBe("/project")
    expect(directories).toEqual(["/project"])
  } finally {
    fixtureState.dispose()
  }
})

test("locks context during mutation and never retries it after reconnect", async () => {
  let writes = 0
  let complete: (state: ControlState) => void = () => {}
  const delayed = new Promise<ControlState>((resolve) => {
    complete = resolve
  })
  const fixtureState = fixture(
    async (directory) => snapshot(directory),
    () => {
      writes++
      return delayed
    },
  )
  try {
    fixtureState.control.select({ server: "remote", project: "/first", directory: "/first" })
    await flush()
    const item = fixtureState.control.view.snapshot?.items[0]
    if (!item) throw new Error("Expected initial state")
    const pending = fixtureState.control.mutate(item, "set", false)
    expect(fixtureState.control.select({ server: "remote", project: "/second", directory: "/second" })).toBe(false)
    fixtureState.setStatus("disconnected")
    await flush()
    expect(fixtureState.control.view.stale).toBe(true)
    fixtureState.setStatus("connected")
    await flush()
    complete({ ...snapshot("/first"), revision: 99 })
    await pending
    expect(writes).toBe(1)
    expect(fixtureState.control.view.snapshot?.revision).toBe(0)
  } finally {
    fixtureState.dispose()
  }
})

test.each([
  ["not_ready", "notReady"],
  ["invalid_configuration", "invalidConfiguration"],
] as const)("reports %s as a rejected write, not an unknown outcome", async (type, error) => {
  let writes = 0
  const fixtureState = fixture(
    async (directory) => snapshot(directory),
    async () => {
      writes++
      throw { type }
    },
  )
  try {
    fixtureState.control.select({ server: "remote", project: "/project", directory: "/project" })
    await flush()
    const item = fixtureState.control.view.snapshot?.items[0]
    if (!item) throw new Error("Expected initial state")
    await fixtureState.control.mutate(item, "set", false)
    expect(fixtureState.control.view.rowError).toEqual({ key: item.key, error })
    expect(fixtureState.control.view.error).toBeUndefined()
    expect(fixtureState.control.view.stale).toBe(false)
    expect(fixtureState.control.view.snapshot?.revision).toBe(0)
    expect(writes).toBe(1)
  } finally {
    fixtureState.dispose()
  }
})
