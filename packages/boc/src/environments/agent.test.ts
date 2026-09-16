import { expect, test } from "bun:test"
import { Location } from "@opencode/schema/location"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { Effect } from "effect"
import { environmentContextHook, prepareEnvironment } from "./agent"
import type { EnvironmentBackend } from "./backend"

test("injects the configured checkout URL into agent system context", async () => {
  const system: Array<{ type: "text"; text: string }> = []
  const hook = environmentContextHook(
    { projectID: "project", directory: "/workspace" },
    {
      agentContext: async () => ({
        stackID: "boc-204-environments",
        host: "boc-204-environments.bergfreunde.de.localhost",
        url: "https://boc-204-environments.bergfreunde.de.localhost/",
      }),
    },
  )

  await Effect.runPromise(hook({ system }))

  expect(system).toHaveLength(1)
  expect(system[0].text).toContain("URL: https://boc-204-environments.bergfreunde.de.localhost/")
  expect(system[0].text).toContain("Host: boc-204-environments.bergfreunde.de.localhost")
  expect(system[0].text).toContain("Stack: boc-204-environments")
})

test("does not add agent context for an unconfigured checkout", async () => {
  const system: Array<{ type: "text"; text: string }> = []
  const hook = environmentContextHook(
    { projectID: "project", directory: "/workspace" },
    { agentContext: async () => undefined },
  )

  await Effect.runPromise(hook({ system }))

  expect(system).toEqual([])
})

for (const mode of [
  { includeChanges: false, strategy: "lane-clean", copied: false },
  { includeChanges: true, strategy: "lane-dirty", copied: true },
]) {
  test(`creates a ${mode.strategy} worktree, starts setup, and moves the session`, async () => {
    const fixture = agentFixture({ changes: 2 })

    const result = await Effect.runPromise(
      prepareEnvironment(
        fixture.context,
        fixture.environments,
        { name: "feature", includeChanges: mode.includeChanges, confirmed: true },
        { sessionID: fixture.sessionID },
      ),
    )

    expect(fixture.creations).toEqual([
      { strategy: mode.strategy, from: fixture.source, name: "feature" },
    ])
    expect(fixture.runs).toHaveLength(1)
    expect(fixture.runs[0]).toMatchObject({ directory: fixture.lane, action: "setup" })
    expect(fixture.moves).toEqual([
      { sessionID: fixture.sessionID, directory: fixture.lane, delivery: "steer" },
    ])
    expect(result.output).toContain(
      mode.copied ? "source checkout remains unchanged" : "remain only in the source checkout",
    )
  })
}

test("removes a new Lane when setup is rejected before it starts", async () => {
  const fixture = agentFixture({ rejection: "not-available" })

  await expect(
    Effect.runPromise(
      prepareEnvironment(
        fixture.context,
        fixture.environments,
        { name: "feature", includeChanges: false, confirmed: true },
        { sessionID: fixture.sessionID },
      ),
    ),
  ).rejects.toThrow("the new Lane was removed")

  expect(fixture.removals).toEqual([{ directory: fixture.lane, force: false }])
  expect(fixture.moves).toEqual([])
})

test("starts a stopped environment in the current Lane without creating another one", async () => {
  const fixture = agentFixture({
    directory: "/workspace/.lane/trees/existing",
    strategy: "lane-dirty",
    environment: environment(AbsolutePath.make("/workspace/.lane/trees/existing"), {
      stack: configuredStack(AbsolutePath.make("/workspace/.lane/trees/existing")),
      containers: { status: "stopped", total: 2, running: 0 },
    }),
  })

  await Effect.runPromise(
    prepareEnvironment(fixture.context, fixture.environments, { confirmed: true }, { sessionID: fixture.sessionID }),
  )

  expect(fixture.creations).toEqual([])
  expect(fixture.runs).toHaveLength(1)
  expect(fixture.runs[0]).toMatchObject({ directory: fixture.directory, action: "start" })
  expect(fixture.moves).toEqual([])
})

test("refuses to copy local changes from a non-primary linked worktree", async () => {
  const fixture = agentFixture({ directory: "/workspace-linked", strategy: "git", changes: 1 })

  await expect(
    Effect.runPromise(
      prepareEnvironment(
        fixture.context,
        fixture.environments,
        { name: "feature", includeChanges: true, confirmed: true },
        { sessionID: fixture.sessionID },
      ),
    ),
  ).rejects.toThrow("only from the primary checkout")

  expect(fixture.creations).toEqual([])
})

function agentFixture(options: {
  directory?: string
  strategy?: string
  changes?: number
  environment?: BocEnvironment.State
  rejection?: Extract<BocEnvironment.OperationResult, { accepted: false }>["reason"]
} = {}) {
  const source = AbsolutePath.make("/workspace")
  const directory = AbsolutePath.make(options.directory ?? source)
  const lane = AbsolutePath.make("/workspace/.lane/trees/feature")
  const projectID = Project.ID.make("project")
  const sessionID = Session.ID.create()
  const location = new Location.Info({
    directory,
    project: { id: projectID, directory: source, canonical: source },
  })
  const creations: Array<{ strategy?: string; from?: string; name?: string }> = []
  const removals: Array<{ directory: string; force: boolean }> = []
  const moves: Array<{ sessionID: string; directory: string; delivery?: string }> = []
  const runs: Array<Parameters<EnvironmentBackend["run"]>[0]> = []
  const context: Parameters<typeof prepareEnvironment>[0] = {
    location,
    worktree: {
      list: () =>
        Effect.succeed([{ directory, ...(options.strategy === undefined ? {} : { strategy: options.strategy }) }]),
      create: (input) =>
        Effect.sync(() => {
          creations.push({ strategy: input?.strategy, from: input?.from, name: input?.name })
          return { directory: lane }
        }),
      remove: (input) =>
        Effect.sync(() => {
          removals.push(input)
        }),
    },
    vcs: {
      status: () =>
        Effect.succeed({
          location,
          data: Array.from({ length: options.changes ?? 0 }, (_, index) => ({
            file: `file-${index}.ts`,
            additions: 1,
            deletions: 0,
            status: "modified" as const,
          })),
        }),
    },
    session: {
      move: (input) =>
        Effect.sync(() => {
          moves.push(input)
        }),
    },
  }
  const environments: Parameters<typeof prepareEnvironment>[1] = {
    inspect: async () => options.environment ?? environment(directory),
    run: async (input) => {
      runs.push(input)
      const state = environment(AbsolutePath.make(input.directory), {
        stack: configuredStack(AbsolutePath.make(input.directory)),
        containers: { status: "running", total: 2, running: 2 },
        latestRun: {
          id: "run",
          action: input.action,
          status: "running",
          startedAt: 0,
          log: "",
          truncated: false,
        },
      })
      if (options.rejection) return { accepted: false, reason: options.rejection, environment: state }
      return { accepted: true, environment: state }
    },
  }
  return { context, environments, source, directory, lane, sessionID, creations, removals, moves, runs }
}

function environment(
  directory: BocEnvironment.State["directory"],
  overrides: Partial<BocEnvironment.State> = {},
): BocEnvironment.State {
  return {
    backend: "local",
    projectID: Project.ID.make("project"),
    directory,
    availability: { available: true },
    stack: { status: "unconfigured" },
    containers: { status: "absent", total: 0, running: 0 },
    http: { status: "unknown" },
    ...overrides,
  }
}

function configuredStack(directory: BocEnvironment.State["directory"]): BocEnvironment.Stack {
  return {
    status: "configured",
    stackID: "feature",
    composeProject: "devenv-feature",
    infrastructureProject: "devenv",
    host: "feature.bergfreunde.de.localhost",
    url: "https://feature.bergfreunde.de.localhost/",
    sourceDirectory: directory,
  }
}
