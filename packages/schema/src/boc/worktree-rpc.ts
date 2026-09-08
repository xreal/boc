export * as BocWorktreeRpc from "./worktree-rpc.js"

import { Schema } from "effect"
import { Project } from "../project.js"
import { Session } from "../session.js"
import { AbsolutePath } from "../schema.js"
import { RiftCapability, RiftCleanupResult, RiftTrashSummary } from "./rift.js"
import { StartInput, State } from "./worktree-preparation.js"

const schema = Schema.toStandardSchemaV1
export const Info = Schema.Struct({ protocol: Schema.Literal(1) })
export const Rpc = {
  id: "boc.worktrees.v1",
  methods: {
    info: { input: schema(Schema.Struct({})), output: schema(Info) },
    prepare: { input: schema(StartInput), output: schema(State) },
    preparation: {
      input: schema(Schema.Struct({ operationID: Session.ID })),
      output: schema(Schema.NullOr(State)),
    },
    riftCapability: {
      input: schema(Schema.Struct({ projectID: Project.ID, source: AbsolutePath, directory: AbsolutePath })),
      output: schema(RiftCapability),
    },
    riftTrash: { input: schema(Schema.Struct({})), output: schema(RiftTrashSummary) },
    cleanupRiftTrash: { input: schema(Schema.Struct({})), output: schema(RiftCleanupResult) },
  },
  events: {},
}
