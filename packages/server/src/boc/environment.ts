import { EnvironmentBackendService } from "@boc/extensions/environments/server"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const BocEnvironmentHandler = HttpApiBuilder.group(Api, "server.boc.environment", (handlers) =>
  Effect.gen(function* () {
    const environments = yield* EnvironmentBackendService
    return handlers
      .handle("boc.environment.inspect", (context) =>
        Effect.promise(() => environments.inspect(context.params.projectID, context.query.directory)),
      )
      .handle("boc.environment.run", (context) =>
        Effect.promise(() =>
          environments.run({
            projectID: context.params.projectID,
            directory: context.payload.directory,
            sessionID: context.payload.sessionID,
            action: context.payload.action,
            domain: context.payload.domain,
            confirmation: context.payload.confirmation,
          }),
        ),
      )
      .handle("boc.environment.cancel", (context) =>
        Effect.promise(() => environments.cancel(context.params.projectID, context.payload.directory)),
      )
  }),
)
