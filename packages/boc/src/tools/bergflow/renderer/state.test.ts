import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import type { ControlState } from "@bergflow/opencode/rpc"
import type { BergflowHost } from "../host"
import { createBergflowControls } from "./state"

function snapshot(directory: string): ControlState {
  return {
    info: {
      protocol: 1,
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
    } as unknown as BergflowHost
    const control = createBergflowControls(host)
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
