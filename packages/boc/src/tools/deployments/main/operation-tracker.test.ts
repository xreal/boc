import { describe, expect, test } from "bun:test"
import type { DeploymentOperationSummary } from "../domain/operations"
import type { DeploymentCommand, DeploymentCommandResult } from "./command-runner"
import { createDeploymentService } from "./deployment-service"
import { githubRunState, readDeploymentOperation } from "./operation-tracker"
import { DEFAULT_DEPLOYMENT_SETTINGS, memoryDeploymentStore } from "./store"

const startedAt = "2026-09-07T12:00:00.000Z"
const operation: DeploymentOperationSummary = {
  id: "deployment-1",
  environment: "02",
  branch: "SHOP-42",
  state: "queued",
  createdAt: startedAt,
  updatedAt: startedAt,
  workflows: [{ filename: "app-shop.yml", state: "queued", runId: "42" }],
}

describe("deployment tracking", () => {
  test("reads actual job phases and completes the deploy while a later job is waiting", async () => {
    const commands: DeploymentCommand[] = []
    const tracked = await readDeploymentOperation(
      {
        run: async (command) => {
          commands.push(command)
          return response("waiting", "", [
            job("Deploy 'shop' / Deploy 02 to adminserver", "success"),
            job("Deploy 'shop' / Deploy 02 to k8s", "success", 2),
            { ...job("Deploy 'shop' / Critical css on 02", "", 3), status: "waiting" },
            job("Test / phpunit", "skipped", 4),
          ])
        },
      },
      operation,
    )
    expect(tracked.state).toBe("success")
    expect(tracked.workflows[0]).toMatchObject({
      runId: "42",
      runUrl: "https://github.com/bergfreunde/shop/actions/runs/42",
      completion: "deployment",
      jobs: [
        { name: "Deploy 'shop' / Deploy 02 to adminserver", state: "success" },
        { name: "Deploy 'shop' / Deploy 02 to k8s", state: "success" },
        { name: "Deploy 'shop' / Critical css on 02", state: "waiting" },
        { name: "Test / phpunit", state: "skipped" },
      ],
    })
    expect(commands[0]?.args).toEqual([
      "run",
      "view",
      "42",
      "--repo",
      "bergfreunde/shop",
      "--json",
      "databaseId,status,conclusion,jobs",
    ])
    expect(commands[0]?.env?.GH_TOKEN).toBeUndefined()
  })

  test("does not mistake another environment's jobs for deployment completion", async () => {
    const tracked = await readDeploymentOperation(
      {
        run: async () =>
          response("in_progress", "", [
            job("Deploy 12 to adminserver", "success"),
            job("Deploy 12 to k8s", "success", 2),
            job("Deploy 02 to k8s", "success", 3),
          ]),
      },
      operation,
    )
    expect(tracked.state).toBe("in-progress")
    expect(tracked.workflows[0]?.completion).toBeUndefined()
  })

  test("retains last known progress on network errors and recovers on the next read", async () => {
    const running = {
      ...operation,
      state: "in-progress" as const,
      workflows: [{ ...operation.workflows[0]!, state: "in-progress" as const }],
    }
    const unavailable = await readDeploymentOperation(
      { run: async () => ({ ok: false, reason: "timeout", stdout: "", stderr: "" }) },
      running,
    )
    expect(unavailable.state).toBe("in-progress")
    expect(unavailable.workflows[0]?.trackingUnavailable).toBe(true)
    const recovered = await readDeploymentOperation({ run: async () => response("completed", "failure") }, unavailable)
    expect(recovered.state).toBe("failure")
    expect(recovered.workflows[0]?.trackingUnavailable).toBe(false)
  })

  test("rejects malformed run data without reporting a false completion", async () => {
    const tracked = await readDeploymentOperation(
      { run: async () => success({ status: "completed", conclusion: "success" }) },
      operation,
    )
    expect(tracked.state).toBe("queued")
    expect(tracked.workflows[0]?.trackingUnavailable).toBe(true)
  })

  test("waits for every workflow before notifying and releasing the environment", async () => {
    const notifications: DeploymentOperationSummary[] = []
    const store = memoryDeploymentStore(undefined, [
      { ...operation, workflows: [{ filename: "app-admin.yml", state: "failure" }, ...operation.workflows] },
    ])
    let finished = false
    const service = createDeploymentService({
      store,
      platform: "linux",
      now: () => Date.parse(startedAt) + 60_000,
      notifyFinished: (operation) => notifications.push(operation),
      run: async () => response(finished ? "completed" : "in_progress", finished ? "success" : ""),
    })
    await service.refreshOperations()
    expect(service.listOperations().operations[0]?.state).toBe("in-progress")
    expect(notifications).toHaveLength(0)
    expect(
      await service.prepareDeployment({
        environment: "02",
        ref: "SHOP-42",
        workflows: [{ filename: "app-shop.yml", inputs: {} }],
      }),
    ).toMatchObject({ ok: false, category: "conflict" })
    finished = true
    await service.refreshOperations()
    await service.refreshOperations()
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ state: "failure", finishedAt: "2026-09-07T12:01:00.000Z" })
    const restarted = createDeploymentService({
      store,
      platform: "linux",
      now: () => Date.parse(startedAt) + 120_000,
      notifyFinished: (operation) => notifications.push(operation),
      run: async () => {
        throw new Error("Finished operations must not be polled")
      },
    })
    await restarted.refreshOperations()
    expect(restarted.listOperations().operations[0]?.state).toBe("failure")
    expect(notifications).toHaveLength(1)
  })

  test("resumes persisted operations in the background and respects disabled notifications", async () => {
    const saved = memoryDeploymentStore({ ...DEFAULT_DEPLOYMENT_SETTINGS, notificationsEnabled: false }, [operation])
    const completed = Promise.withResolvers<void>()
    const store = {
      ...saved,
      writeOperations: (operations: readonly DeploymentOperationSummary[]) => {
        saved.writeOperations(operations)
        completed.resolve()
      },
    }
    const notifications: DeploymentOperationSummary[] = []
    let reads = 0
    const service = createDeploymentService({
      store,
      platform: "linux",
      now: () => Date.parse(startedAt) + 60_000,
      notifyFinished: (operation) => notifications.push(operation),
      run: async () => {
        reads += 1
        return response("completed", "success")
      },
    })
    service.startTracking()
    service.startTracking()
    await completed.promise
    service.stopTracking()
    await service.refreshOperations()
    expect(reads).toBe(1)
    expect(service.listOperations().operations[0]?.state).toBe("success")
    expect(notifications).toHaveLength(0)
  })

  test("recovers a missing identity only from an unambiguous environment-specific run", async () => {
    const missing = { ...operation, workflows: [{ filename: "app-shop.yml" as const, state: "unknown" as const }] }
    const runtime = {
      run: async (command: DeploymentCommand) =>
        command.args[1] === "list"
          ? success([
              { databaseId: 42, createdAt: startedAt },
              { databaseId: 99, createdAt: "2026-09-07T11:00:00Z" },
            ])
          : response("in_progress", "", [
              job("Deploy 02 to adminserver", "success"),
              { ...job("Deploy 02 to k8s", "", 2), status: "in_progress" },
            ]),
    }
    expect((await readDeploymentOperation(runtime, missing)).workflows[0]).toMatchObject({
      runId: "42",
      state: "in-progress",
    })
    const ambiguous = await readDeploymentOperation(
      {
        run: async (command) =>
          command.args[1] === "list"
            ? success([
                { databaseId: 42, createdAt: startedAt },
                { databaseId: 43, createdAt: startedAt },
              ])
            : response("completed", "success", [
                job("Deploy 02 to adminserver", "success"),
                job("Deploy 02 to k8s", "success", 2),
              ]),
      },
      missing,
    )
    expect(ambiguous.workflows[0]?.runId).toBeUndefined()
    expect(ambiguous.workflows[0]?.trackingUnavailable).toBe(true)
  })

  test.each([
    ["completed", "success", "success"],
    ["completed", "failure", "failure"],
    ["completed", "cancelled", "cancelled"],
    ["completed", "timed_out", "timed-out"],
    ["completed", "neutral", "unknown"],
    ["waiting", "", "in-progress"],
    ["queued", "", "queued"],
  ] as const)("maps GitHub %s / %s to %s", (status, conclusion, expected) => {
    expect(githubRunState(status, conclusion)).toBe(expected)
  })
})

function job(name: string, conclusion: string, databaseId = 1) {
  return { databaseId, name, status: "completed", conclusion }
}

function response(status: string, conclusion: string, jobs: ReturnType<typeof job>[] = []) {
  return success({ databaseId: 42, status, conclusion, jobs })
}

function success(value: unknown): DeploymentCommandResult {
  return { ok: true, exitCode: 0, stdout: JSON.stringify(value), stderr: "" }
}
