import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"

const now = Date.UTC(2026, 8, 6, 9, 30)

const base: BocEnvironment.State = {
  backend: "local",
  projectID: Project.ID.make("project_fixture"),
  directory: AbsolutePath.make("/workspace/checkouts/BOC-204-environments"),
  availability: { available: true },
  stack: { status: "unconfigured" },
  containers: { status: "absent", total: 0, running: 0 },
  http: { status: "unknown" },
}

const configured = {
  status: "configured" as const,
  stackID: "boc-204-environments-a4d2",
  composeProject: "devenv-worktree-boc-204-environments-a4d2",
  infrastructureProject: "devenv",
  host: "boc-204-environments-a4d2.shop.localhost",
  url: "https://boc-204-environments-a4d2.shop.localhost",
  sourceDirectory: base.directory,
}

export const environmentFixtures = {
  unconfigured: base,
  setupRunning: {
    ...base,
    latestRun: {
      id: "run_setup_running",
      action: "setup",
      status: "running",
      startedAt: now - 32_000,
      log: "$ worktree-setup /workspace/checkouts/BOC-204-environments\nRestoring Composer dependencies…\nBuilding frontend assets…\n",
      truncated: false,
    },
  },
  setupFailed: {
    ...base,
    latestRun: {
      id: "run_setup_failed",
      action: "setup",
      status: "failed",
      startedAt: now - 78_000,
      endedAt: now - 8_000,
      exitCode: 1,
      log: "$ worktree-setup /workspace/checkouts/BOC-204-environments\nFrontend build failed.\n",
      truncated: false,
    },
  },
  setupCancelled: {
    ...base,
    stack: configured,
    containers: { status: "partial", total: 6, running: 2 },
    latestRun: {
      id: "run_setup_cancelled",
      action: "setup",
      status: "cancelled",
      startedAt: now - 45_000,
      endedAt: now - 4_000,
      exitCode: 130,
      log: "$ worktree-setup /workspace/checkouts/BOC-204-environments\nSetup cancelled. Existing resources were left in place.\n",
      truncated: false,
    },
  },
  configuredUnknown: {
    ...base,
    stack: configured,
    containers: { status: "unknown", total: 0, running: 0 },
  },
  stopped: {
    ...base,
    stack: configured,
    containers: { status: "stopped", total: 6, running: 0 },
    latestRun: {
      id: "run_stop_succeeded",
      action: "stop",
      status: "succeeded",
      startedAt: now - 15_000,
      endedAt: now - 3_000,
      exitCode: 0,
      log: "$ devenv stop\r\n\u001b[?25l\u001b[0G[+] stop 0/6\r\n\u001b[33mContainer shop Stopping\u001b[0m\r\n\u001b[32mStopped 6 containers.\u001b[0m\r\n",
      truncated: false,
    },
  },
  running: {
    ...base,
    stack: configured,
    containers: { status: "running", total: 6, running: 6 },
    http: { status: "ready", checkedAt: now - 2_000, statusCode: 200 },
    latestRun: {
      id: "run_start_succeeded",
      action: "start",
      status: "succeeded",
      startedAt: now - 20_000,
      endedAt: now - 2_000,
      exitCode: 0,
      log: "$ devenv start\nStarted 6 containers.\nHTTP readiness verified.\n",
      truncated: false,
    },
  },
  partial: {
    ...base,
    stack: configured,
    containers: { status: "partial", total: 6, running: 4 },
    http: { status: "unreachable", checkedAt: now - 5_000 },
  },
  invalidAssignment: {
    ...base,
    availability: { available: false, reason: "checkout-ownership-mismatch" },
    stack: { status: "invalid" },
    containers: { status: "unknown", total: 0, running: 0 },
  },
  backendUnavailable: {
    ...base,
    availability: { available: false, reason: "backend-unavailable" },
    containers: { status: "unknown", total: 0, running: 0 },
  },
} satisfies Record<string, BocEnvironment.State>

export type EnvironmentFixtureName = keyof typeof environmentFixtures
