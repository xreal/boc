import { describe, expect, test } from "bun:test"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { environmentFixtures } from "./fixtures"
import { createEnvironmentRegistry, createEnvironmentResource } from "./store"

describe("shared environment store", () => {
  test("shares one resource and one inspection per backend checkout", async () => {
    const calls = { inspect: 0 }
    const api = () => ({
      inspect: async () => {
        calls.inspect += 1
        return environmentFixtures.running
      },
      run: async () => ({ accepted: true as const, environment: environmentFixtures.running }),
      cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
      logs: async () => ({ available: true, text: "", checkedAt: 0 }),
      resize: async () => true,
    })
    const registry = createEnvironmentRegistry()
    const input = {
      server: "sidecar",
      projectID: "project_fixture",
      directory: "/workspace/checkouts/BOC-204-environments",
      api,
    }

    const first = registry.acquire(input)
    const second = registry.acquire({ ...input, directory: `${input.directory}/` })
    expect(first).toBe(second)
    await Promise.all([first.inspect(), second.inspect()])
    expect(calls.inspect).toBe(1)
    expect(first.state.environment).toEqual(environmentFixtures.running)
    expect(registry.size()).toBe(1)

    registry.release(first)
    registry.release(second)
    expect(registry.size()).toBe(0)
    registry.dispose()
  })

  test("uses the latest generated client and preserves the target session context", async () => {
    const calls: Array<{ sessionID: string; action: string; domain?: string }> = []
    const client = { generation: 1 }
    const resource = createEnvironmentResource({
      server: "sidecar",
      projectID: "project_fixture",
      directory: environmentFixtures.unconfigured.directory,
      api: () => ({
        inspect: async () => environmentFixtures.unconfigured,
        run: async (input) => {
          calls.push({ sessionID: input.sessionID, action: input.action, domain: input.domain })
          return {
            accepted: true as const,
            environment: {
              ...environmentFixtures.setupRunning,
              latestRun: {
                ...environmentFixtures.setupRunning.latestRun,
                id: `generation-${client.generation}`,
              },
            },
          }
        },
        cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
        logs: async () => ({ available: true, text: "", checkedAt: 0 }),
        resize: async () => true,
      }),
    })

    await resource.run("setup", "session_from_clicked_tab", { domain: "shop.localhost" })
    client.generation = 2
    await resource.run("start", "session_from_active_header")

    expect(calls).toEqual([
      { sessionID: "session_from_clicked_tab", action: "setup", domain: "shop.localhost" },
      { sessionID: "session_from_active_header", action: "start", domain: undefined },
    ])
    expect(resource.state.environment?.latestRun?.id).toBe("generation-2")
    resource.dispose()
  })

  test("refreshes only while an observed operation is active", async () => {
    const refreshed = Promise.withResolvers<void>()
    const states: BocEnvironment.State[] = [environmentFixtures.setupRunning, environmentFixtures.running]
    const calls = { inspect: 0 }
    const resource = createEnvironmentResource({
      server: "sidecar",
      projectID: "project_fixture",
      directory: environmentFixtures.unconfigured.directory,
      refreshDelayMs: 0,
      api: () => ({
        inspect: async () => {
          const state = states[Math.min(calls.inspect, states.length - 1)]
          calls.inspect += 1
          if (calls.inspect === 2) refreshed.resolve()
          return state
        },
        run: async () => ({ accepted: true as const, environment: environmentFixtures.setupRunning }),
        cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
        logs: async () => ({ available: true, text: "", checkedAt: 0 }),
        resize: async () => true,
      }),
    })

    resource.observe()
    await resource.inspect()
    await refreshed.promise
    await Promise.resolve()
    expect(calls.inspect).toBe(2)
    expect(resource.state.environment?.latestRun?.status).toBe("succeeded")
    resource.unobserve()
    resource.dispose()
  })

  test("releases an unobserved active resource instead of retaining stale running state", async () => {
    const registry = createEnvironmentRegistry()
    const resource = registry.acquire({
      server: "sidecar",
      projectID: "project_fixture",
      directory: environmentFixtures.setupRunning.directory,
      api: () => ({
        inspect: async () => environmentFixtures.setupRunning,
        run: async () => ({ accepted: true as const, environment: environmentFixtures.setupRunning }),
        cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
        logs: async () => ({ available: true, text: "", checkedAt: 0 }),
        resize: async () => true,
      }),
    })

    await resource.inspect()
    registry.release(resource)

    expect(registry.size()).toBe(0)
    registry.dispose()
  })

  test("exposes cancel and rejected operations without inventing success", async () => {
    const resource = createEnvironmentResource({
      server: "sidecar",
      projectID: "project_fixture",
      directory: environmentFixtures.unconfigured.directory,
      api: () => ({
        inspect: async () => environmentFixtures.setupRunning,
        run: async () => ({
          accepted: false as const,
          reason: "operation-running" as const,
          environment: environmentFixtures.setupRunning,
        }),
        cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
        logs: async () => ({ available: true, text: "", checkedAt: 0 }),
        resize: async () => true,
      }),
    })

    expect(await resource.run("start", "session_two")).toBe(false)
    expect(resource.state.rejection).toBe("operation-running")
    await resource.inspect()
    expect(resource.state.rejection).toBeUndefined()
    expect(await resource.cancel()).toBe(true)
    expect(resource.state.environment?.latestRun?.status).toBe("cancelled")
    resource.dispose()
  })
})
