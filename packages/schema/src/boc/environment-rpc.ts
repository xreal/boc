export * as BocEnvironmentRpc from "./environment-rpc.js"

import { Schema } from "effect"
import { Project } from "../project.js"
import { Session } from "../session.js"
import { AbsolutePath, optional } from "../schema.js"
import { Action, CancelResult, ContainerLogs, OperationResult, State } from "./environment.js"

const schema = Schema.toStandardSchemaV1
export const Info = Schema.Struct({ protocol: Schema.Literal(2) })
const Checkout = Schema.Struct({ projectID: Project.ID, directory: AbsolutePath })
export const Rpc = {
  id: "boc.environments.v1",
  methods: {
    info: { input: schema(Schema.Struct({})), output: schema(Info) },
    inspect: { input: schema(Checkout), output: schema(State) },
    run: {
      input: schema(
        Schema.Struct({
          ...Checkout.fields,
          sessionID: Session.ID,
          action: Action,
          containerID: optional(Schema.String),
          domain: optional(Schema.String),
          confirmation: optional(Schema.Literal("remove-environment")),
        }),
      ),
      output: schema(OperationResult),
    },
    cancel: { input: schema(Checkout), output: schema(CancelResult) },
    logs: {
      input: schema(Schema.Struct({ ...Checkout.fields, containerID: Schema.String })),
      output: schema(ContainerLogs),
    },
    resize: {
      input: schema(Schema.Struct({ ...Checkout.fields, runID: Schema.String, cols: Schema.Int, rows: Schema.Int })),
      output: schema(Schema.Boolean),
    },
  },
  events: {},
}
