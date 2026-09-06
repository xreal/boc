import { Action, CancelResult, OperationResult, State } from "@opencode-ai/schema/boc/environment"
import { Project } from "@opencode-ai/schema/project"
import { AbsolutePath, optional } from "@opencode-ai/schema/schema"
import { Session } from "@opencode-ai/schema/session"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"

const root = "/api/boc/environment/:projectID"

export const BocEnvironmentGroup = HttpApiGroup.make("server.boc.environment")
  .add(
    HttpApiEndpoint.get("boc.environment.inspect", root, {
      params: { projectID: Project.ID },
      query: { directory: AbsolutePath },
      success: State,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.boc.environment.inspect",
        summary: "Inspect a Boc development environment",
        description: "Inspect checkout ownership, stack configuration, containers, HTTP readiness, and the latest run.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("boc.environment.run", `${root}/run`, {
      params: { projectID: Project.ID },
      payload: Schema.Struct({
        directory: AbsolutePath,
        sessionID: Session.ID,
        action: Action,
        domain: optional(Schema.String),
        confirmation: optional(Schema.Literal("remove-environment")),
      }),
      success: OperationResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.boc.environment.run",
        summary: "Run a Boc development environment action",
        description: "Start one checkout-scoped setup, start, stop, or confirmed remove operation.",
      }),
    ),
  )
  .add(
    HttpApiEndpoint.post("boc.environment.cancel", `${root}/cancel`, {
      params: { projectID: Project.ID },
      payload: Schema.Struct({ directory: AbsolutePath }),
      success: CancelResult,
    }).annotateMerge(
      OpenApi.annotations({
        identifier: "v2.boc.environment.cancel",
        summary: "Cancel a Boc development environment action",
        description: "Terminate the active checkout-scoped operation without stopping or removing its stack.",
      }),
    ),
  )
  .annotateMerge(OpenApi.annotations({ title: "boc", description: "Boc-specific backend capabilities." }))
