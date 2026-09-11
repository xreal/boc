import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createDeploymentPreflight, type DeploymentDialogApi } from "./deploy-preflight"
import { createFixtureDeploymentApi } from "../fixtures/preflight"
import { deploymentSystemFixtures } from "../fixtures/systems"

const system = { ...deploymentSystemFixtures[0], branch: "master" }
const pause = (ms = 260) => new Promise((resolve) => setTimeout(resolve, ms))

function fixture(
  overrides: Partial<DeploymentDialogApi> = {},
  initialRef?: string,
  kind: "deploy" | "reset" = "deploy",
) {
  return createRoot((dispose) => ({
    dispose,
    preflight: createDeploymentPreflight({
      api: { ...createFixtureDeploymentApi(), ...overrides },
      system,
      kind,
      initialRef,
    }),
  }))
}

function deferred<T>() {
  const pending = Promise.withResolvers<T>()
  return pending
}

describe("deployment preflight", () => {
  test("typing searches without preparing until a branch is selected", async () => {
    const api = createFixtureDeploymentApi()
    const drafts: string[] = []
    const f = fixture(
      {
        prepareDeployment: async (draft) => {
          drafts.push(draft.ref)
          return api.prepareDeployment(draft)
        },
      },
      "SHOP-617",
    )
    try {
      await f.preflight.start()
      await pause()
      expect(drafts).toEqual([])
      f.preflight.editBranch("SHOP-617-product-gallery")
      await pause()
      expect(drafts).toEqual([])
      f.preflight.selectBranch("SHOP-617-product-gallery")
      await pause()
      expect(drafts).toEqual(["SHOP-617-product-gallery"])
      expect(f.preflight.state.status).toBe("ready")
    } finally {
      f.dispose()
    }
  })

  test("older preparation cannot overwrite a ready draft or publish an error", async () => {
    const api = createFixtureDeploymentApi()
    const stale = deferred<Awaited<ReturnType<DeploymentDialogApi["prepareDeployment"]>>>()
    const cancelled: string[] = []
    const f = fixture({
      cancelSystemsRead: async ({ requestId }) => {
        cancelled.push(requestId)
      },
      prepareDeployment: (draft) => (draft.ref === "master" ? stale.promise : api.prepareDeployment(draft)),
    })
    try {
      await f.preflight.start()
      await pause()
      expect(f.preflight.state.status).toBe("checking")
      f.preflight.selectBranch("SHOP-617-product-gallery")
      await pause()
      expect(f.preflight.state.status).toBe("ready")
      stale.resolve({ ok: false, category: "network", retryable: true })
      await pause(0)
      expect(f.preflight.state.status).toBe("ready")
      expect(f.preflight.state.plan?.ref).toBe("SHOP-617-product-gallery")
      expect(f.preflight.state.failure).toBeUndefined()
      expect(cancelled.some((id) => id.includes("prepare"))).toBe(true)
    } finally {
      f.dispose()
    }
  })

  test("workflow selection preserves edits and sends only each workflow's inputs", async () => {
    const f = fixture()
    try {
      await f.preflight.start()
      f.preflight.setInput("app-shop.yml", "perform_tests", false)
      f.preflight.toggleWorkflow("app-admin.yml", true)
      expect(f.preflight.workflows()[0].inputs.perform_tests).toBe(false)
      expect(f.preflight.workflows()[1].inputs).toEqual({ perform_tests: true })
      f.preflight.toggleWorkflow("app-shop.yml", false)
      await pause()
      expect(f.preflight.state.status).toBe("ready")
      expect(f.preflight.state.plan?.workflows).toHaveLength(1)
      f.preflight.toggleWorkflow("app-shop.yml", true)
      expect(f.preflight.workflows()[0].inputs.perform_tests).toBe(false)
    } finally {
      f.dispose()
    }
  })

  test("expiry is reactive and checking again recovers without editing", async () => {
    const api = createFixtureDeploymentApi()
    let first = true
    const f = fixture({
      prepareDeployment: async (draft) => {
        const result = await api.prepareDeployment(draft)
        if (!result.ok || !first) return result
        first = false
        return { ...result, plan: { ...result.plan, expiresAt: new Date(Date.now() + 100).toISOString() } }
      },
    })
    try {
      await f.preflight.start()
      await pause(350)
      expect(f.preflight.state.status).toBe("expired")
      await f.preflight.prepare()
      expect(f.preflight.state.status).toBe("ready")
    } finally {
      f.dispose()
    }
  })

  test("transport failures leave a recoverable state rather than a spinner", async () => {
    const f = fixture({
      prepareDeployment: async () => {
        throw new Error("transport closed")
      },
    })
    try {
      await f.preflight.start()
      await pause()
      expect(f.preflight.state.status).toBe("failed")
      expect(f.preflight.state.failure?.category).toBe("network")
    } finally {
      f.dispose()
    }
  })

  test("disposing cancels preparation and ignores its result", async () => {
    const pending = deferred<Awaited<ReturnType<DeploymentDialogApi["prepareDeployment"]>>>()
    const cancelled: string[] = []
    const f = fixture({
      prepareDeployment: () => pending.promise,
      cancelSystemsRead: async ({ requestId }) => {
        cancelled.push(requestId)
      },
    })
    await f.preflight.start()
    await pause()
    f.dispose()
    pending.resolve({ ok: false, category: "network", retryable: true })
    await pause(0)
    expect(cancelled.some((id) => id.includes("prepare"))).toBe(true)
    expect(f.preflight.state.failure).toBeUndefined()
  })

  test("reset prepares directly without loading an editable catalog", async () => {
    const f = fixture(
      {
        listWorkflowTargets: async () => {
          throw new Error("reset must not load twice")
        },
      },
      undefined,
      "reset",
    )
    try {
      await f.preflight.start()
      expect(f.preflight.state.status).toBe("ready")
      expect(f.preflight.state.plan?.kind).toBe("reset")
    } finally {
      f.dispose()
    }
  })

  test("loads the committed branch's workflow contract and prunes obsolete overrides", async () => {
    const api = createFixtureDeploymentApi()
    const refs: (string | undefined)[] = []
    const f = fixture({
      listWorkflowTargets: async (input) => {
        refs.push(input.ref)
        if (input.ref !== "feature") return api.listWorkflowTargets(input)
        return {
          ok: true,
          targets: [
            {
              filename: "app-shop.yml",
              name: "Shop",
              inputs: [{ name: "perform_tests", label: "Tests", type: "boolean", required: true, default: true }],
            },
          ],
        }
      },
    })
    try {
      await f.preflight.start()
      f.preflight.setInput("app-shop.yml", "force_rebuild", true)
      f.preflight.setInput("app-shop.yml", "perform_tests", false)
      f.preflight.selectBranch("feature")
      await pause(0)
      expect(refs).toEqual(["master", "feature"])
      expect(f.preflight.workflows()[0].inputs).toEqual({ perform_tests: false })
      expect(f.preflight.validInputs()).toBe(true)
    } finally {
      f.dispose()
    }
  })

  test("allows only one dispatch and never retries an uncertain submission", async () => {
    const pending = deferred<Awaited<ReturnType<DeploymentDialogApi["dispatchPrepared"]>>>()
    let calls = 0
    const f = fixture({
      dispatchPrepared: () => {
        calls++
        return pending.promise
      },
    })
    try {
      await f.preflight.start()
      await pause()
      const dispatch = f.preflight.dispatch()
      await f.preflight.dispatch()
      expect(calls).toBe(1)
      expect(f.preflight.state.status).toBe("submitting")
      pending.reject(new Error("connection lost"))
      await dispatch
      expect(f.preflight.state.status).toBe("failed")
      expect(f.preflight.state.failure?.context?.field).toBe("dispatch")
      await f.preflight.dispatch()
      expect(calls).toBe(1)
    } finally {
      f.dispose()
    }
  })

  test("stale search responses cannot replace newer suggestions", async () => {
    const pending = deferred<Awaited<ReturnType<DeploymentDialogApi["listBranches"]>>>()
    const api = createFixtureDeploymentApi()
    const f = fixture({ listBranches: (input) => (input.query === "SHOP" ? pending.promise : api.listBranches(input)) })
    try {
      f.preflight.editBranch("SHOP")
      await pause()
      f.preflight.editBranch("OPS")
      await pause()
      pending.resolve({ ok: true, branches: ["SHOP-stale"] })
      await pause(0)
      expect(f.preflight.state.branches).toContain("OPS-88-queue-observability")
      expect(f.preflight.state.branches).not.toContain("SHOP-stale")
      expect(f.preflight.state.searching).toBe(false)
    } finally {
      f.dispose()
    }
  })
})
