import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Tool } from "@opencode/schema/tool"
import { Effect, Schema } from "effect"
import type { AgentEnvironment, EnvironmentBackend } from "./backend"

const StatusInput = Schema.Struct({})
const StatusOutput = Schema.String
const PrepareInput = Schema.Struct({
  name: Schema.optionalKey(
    Schema.Trim.pipe(Schema.check(Schema.isNonEmpty())).annotate({
      description: "Short worktree name derived from the task or ticket. Required when creating a new worktree.",
    }),
  ),
  confirmed: Schema.Literal(true).annotate({
    description:
      "Set to true only after the user confirms the Lane name and that tracked and ordinary untracked changes will stay in the source checkout.",
  }),
})
const PrepareOutput = Schema.String

type EnvironmentAgentContext = {
  readonly location: Context["location"]
  readonly session: Pick<Context["session"], "move">
  readonly vcs: Pick<Context["vcs"], "status">
  readonly worktree: Pick<Context["worktree"], "list" | "create" | "remove">
}

export function registerEnvironmentAgent(context: Context, environments: EnvironmentBackend) {
  const location = {
    projectID: context.location.project.id,
    directory: context.location.directory,
  }

  return Effect.gen(function* () {
    yield* context.session.hook("context", environmentContextHook(location, environments))
    yield* context.tool.transform((editor) => {
      editor.namespace({ name: "boc", description: "Isolated Git worktrees and local application environments." })
      editor.add({
        name: "environment_status",
        description:
          "Inspect the local application environment attached to the current isolated worktree. Returns its canonical URL, container states, HTTP readiness, and latest lifecycle status. This tool is read-only.",
        input: StatusInput,
        output: StatusOutput,
        options: { namespace: "boc", codemode: true },
        execute: () =>
          Effect.tryPromise({
            try: () => environments.inspect(location.projectID, location.directory),
            catch: (error) => new Tool.Error({ message: "Unable to inspect the development environment", error }),
          }).pipe(
            Effect.map((environment) => {
              const output = environmentStatus(environment)
              return toolResult(output)
            }),
          ),
      })
      editor.add({
        name: "prepare_environment",
        description:
          "Create a clean isolated Git worktree with Lane and start its app stack only when needed and after explicit user approval. Use this for feature work that benefits from isolation or requires testing a running application. Before calling, propose a short worktree name and say that current tracked and ordinary untracked changes will remain only in the source checkout; the user must approve both. Outside an existing managed worktree, creates a clean Lane, starts the project's Devenv lifecycle, and moves the current session at the next safe boundary. Never use it for analysis, read-only work, or routine small edits. In an existing managed worktree, starts or resumes its environment without creating another worktree. The source checkout is never cleaned. Do not run destination-dependent tools in the same execute call. After the move, use environment_status in a later call to verify readiness before claiming the application works.",
        input: PrepareInput,
        output: PrepareOutput,
        options: { namespace: "boc", codemode: true, pinned: true },
        execute: (input, call) => prepareEnvironment(context, environments, input, call),
      })
    })
  })
}

export function prepareEnvironment(
  context: EnvironmentAgentContext,
  environments: Pick<EnvironmentBackend, "inspect" | "run">,
  input: typeof PrepareInput.Type,
  call: Pick<Tool.Context, "sessionID">,
) {
  return Effect.gen(function* () {
    const worktrees = yield* context.worktree
      .list({ projectID: context.location.project.id })
      .pipe(Effect.mapError(toolError("Unable to inspect the current worktree")))
    const current = worktrees.find((worktree) => worktree.directory === context.location.directory)
    if (isLaneStrategy(current?.strategy)) {
      return yield* prepareCurrentEnvironment(context, environments, call.sessionID)
    }

    if (!input.name) return yield* new Tool.Error({ message: "A Lane name is required for this checkout" })

    const changes = yield* context.vcs
      .status()
      .pipe(Effect.mapError(toolError("Unable to inspect local changes before creating the Lane")))
    const created = yield* context.worktree
      .create({
        projectID: context.location.project.id,
        from: context.location.directory,
        name: input.name,
      })
      .pipe(Effect.mapError(toolError(`Unable to create Lane ${input.name}`)))
    const createdOwner = yield* context.worktree
      .list({ projectID: context.location.project.id })
      .pipe(
        Effect.map(
          (inventory) => inventory.find((worktree) => worktree.directory === created.directory)?.strategy,
        ),
        Effect.mapError(toolError(`Lane ${created.directory} was created, but its owner could not be verified`)),
      )
    if (createdOwner !== "lane") {
      yield* context.worktree
        .remove({ projectID: context.location.project.id, directory: created.directory, force: false })
        .pipe(
          Effect.mapError(
            toolError(
              `A worktree was created with strategy ${createdOwner ?? "unknown"} instead of Lane and could not be removed: ${created.directory}`,
            ),
          ),
        )
      return yield* new Tool.Error({
        message: `The Lane plugin is not the selected worktree strategy; the unexpected ${createdOwner ?? "unknown"} worktree was removed`,
      })
    }
    const operation = yield* runEnvironment(environments, {
      projectID: context.location.project.id,
      directory: created.directory,
      sessionID: call.sessionID,
      action: "setup",
    })

    if (!operation.accepted && operation.reason === "operation-running") {
      return yield* new Tool.Error({
        message: `Lane ${created.directory} was created, but another environment operation is already running`,
      })
    }
    if (!operation.accepted) {
      yield* context.worktree
        .remove({ projectID: context.location.project.id, directory: created.directory, force: false })
        .pipe(
          Effect.mapError(
            toolError(
              `Environment setup was rejected (${operation.reason}) and the new Lane could not be removed: ${created.directory}`,
            ),
          ),
        )
      return yield* new Tool.Error({
        message: `Environment setup was rejected (${operation.reason}); the new Lane was removed`,
      })
    }

    yield* context.session
      .move({ sessionID: call.sessionID, directory: created.directory, delivery: "steer" })
      .pipe(
        Effect.mapError(
          toolError(`Lane ${created.directory} was created and setup started, but the session could not be moved`),
        ),
      )

    const sourceChanges =
      changes.data.length === 0
        ? "The source checkout was clean."
        : `${changes.data.length} changed file(s) remain only in the source checkout.`
    return toolResult(
      `Lane created: ${created.directory}\n${sourceChanges}\nEnvironment setup started. The session will move at the next safe boundary.\n\n${environmentStatus(operation.environment)}`,
    )
  })
}

function prepareCurrentEnvironment(
  context: EnvironmentAgentContext,
  environments: Pick<EnvironmentBackend, "inspect" | "run">,
  sessionID: Tool.Context["sessionID"],
) {
  return Effect.gen(function* () {
    const environment = yield* Effect.tryPromise({
      try: () => environments.inspect(context.location.project.id, context.location.directory),
      catch: toolError("Unable to inspect the current Lane environment"),
    })
    if (!environment.availability.available) {
      return yield* new Tool.Error({
        message: `The current Lane environment is unavailable: ${environment.availability.reason}`,
      })
    }
    if (environment.latestRun?.status === "running") {
      return toolResult(`Environment preparation is already running.\n\n${environmentStatus(environment)}`)
    }
    if (environment.stack.status === "invalid") {
      return yield* new Tool.Error({ message: "The current Lane environment configuration is invalid" })
    }
    if (environment.stack.status === "configured" && environment.containers.status === "running") {
      return toolResult(`Development environment is already running.\n\n${environmentStatus(environment)}`)
    }
    if (environment.stack.status === "configured" && environment.containers.status === "unknown") {
      return yield* new Tool.Error({
        message: "Container state is unknown; inspect the environment before starting another operation",
      })
    }

    const action =
      environment.stack.status === "unconfigured" || environment.containers.status === "absent" ? "setup" : "start"
    const operation = yield* runEnvironment(environments, {
      projectID: context.location.project.id,
      directory: context.location.directory,
      sessionID,
      action,
    })
    if (!operation.accepted) {
      return yield* new Tool.Error({ message: `Environment ${action} was rejected: ${operation.reason}` })
    }
    return toolResult(
      `Environment ${action === "setup" ? "setup" : "start"} started.\n\n${environmentStatus(operation.environment)}`,
    )
  })
}

function runEnvironment(environments: Pick<EnvironmentBackend, "run">, input: Parameters<EnvironmentBackend["run"]>[0]) {
  return Effect.tryPromise({
    try: () => environments.run(input),
    catch: toolError(`Unable to ${input.action} the development environment`),
  })
}

function isLaneStrategy(strategy: string | undefined) {
  return strategy === "lane"
}

function toolError(message: string) {
  return (error: unknown) => new Tool.Error({ message, error })
}

function toolResult(output: string) {
  return { output, content: output }
}

export function environmentContextHook(
  location: { projectID: string; directory: string },
  environments: Pick<EnvironmentBackend, "agentContext">,
) {
  return (event: Pick<SessionHooks["context"], "system">) =>
    Effect.promise(() => environments.agentContext(location.projectID, location.directory)).pipe(
      Effect.tap((environment) =>
        Effect.sync(() => {
          if (!environment) return
          event.system.push({ type: "text", text: environmentInstruction(environment) })
        }),
      ),
      Effect.catchCause((cause) =>
        Effect.logWarning("failed to load Boc development environment agent context", {
          directory: location.directory,
          cause,
        }),
      ),
      Effect.asVoid,
    )
}

function environmentInstruction(environment: AgentEnvironment) {
  return `<development-environment>
The current checkout has a Boc-managed development environment.

URL: ${environment.url}
Host: ${environment.host}
Stack: ${environment.stackID}

Use this URL when testing or debugging the application. The local TLS certificate may require curl's -k option. Check live readiness before claiming that the application works.
</development-environment>`
}

function environmentStatus(environment: Awaited<ReturnType<EnvironmentBackend["inspect"]>>) {
  if (!environment.availability.available)
    return `Development environment unavailable: ${environment.availability.reason}`
  if (environment.stack.status === "unconfigured") return "Development environment is not configured."
  if (environment.stack.status === "invalid") return "Development environment configuration is invalid."

  const http =
    environment.http.status === "ready" ? `ready (HTTP ${environment.http.statusCode})` : environment.http.status
  const operation = environment.latestRun
    ? `\nLatest lifecycle operation: ${environment.latestRun.action} — ${environment.latestRun.status}`
    : ""
  const containers = environment.containers.items?.length
    ? `\n\nContainers:\n${environment.containers.items
        .map(
          (container) =>
            `- ${container.service}: ${container.state}${container.health === "none" ? "" : ` (${container.health})`}`,
        )
        .join("\n")}`
    : ""

  return `Development environment
URL: ${environment.stack.url}
Host: ${environment.stack.host}
Stack: ${environment.stack.stackID}
Containers: ${environment.containers.status} (${environment.containers.running}/${environment.containers.total} running)
HTTP: ${http}${operation}${containers}`
}
