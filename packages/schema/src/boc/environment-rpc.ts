export * as BocEnvironmentRpc from "./environment-rpc.js"

import { Schema } from "effect"
import { Project } from "../project.js"
import { Session } from "../session.js"
import { AbsolutePath, optional } from "../schema.js"
import { Action, CancelResult, OperationResult, State } from "./environment.js"

const schema = Schema.toStandardSchemaV1
export const Info = Schema.Struct({ protocol: Schema.Literal(1) })
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
          domain: optional(Schema.String),
          confirmation: optional(Schema.Literal("remove-environment")),
        }),
      ),
      output: schema(OperationResult),
    },
    cancel: { input: schema(Checkout), output: schema(CancelResult) },
  },
  events: {},
}
