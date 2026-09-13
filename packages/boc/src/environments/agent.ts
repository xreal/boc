import type { Context } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Tool } from "@opencode/schema/tool"
import { Effect, Schema } from "effect"
import type { AgentEnvironment, EnvironmentBackend } from "./backend"

const StatusInput = Schema.Struct({})
const StatusOutput = Schema.String

export function registerEnvironmentAgent(context: Context, environments: EnvironmentBackend) {
  const location = {
    projectID: context.location.project.id,
    directory: context.location.directory,
  }

  return Effect.gen(function* () {
    yield* context.session.hook("context", environmentContextHook(location, environments))
    yield* context.tool.transform((editor) => {
      editor.namespace({ name: "boc", description: "Boc worktree development environment tools." })
      editor.add({
        name: "environment_status",
        description:
          "Inspect the current Boc-managed Lane worktree environment. Returns its canonical URL, container states, HTTP readiness, and latest lifecycle status. This tool is read-only.",
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
              return { output, content: output }
            }),
          ),
      })
    })
  })
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
