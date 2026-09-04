import { Effect } from "effect"
import { JiraRpcs } from "../rpcs"

export const jiraHandlers = JiraRpcs.toLayer(
  JiraRpcs.of({
    BocJiraGetConnectionStatus: () => Effect.succeed({ status: "not-configured" as const }),
  }),
)
