import { Layer } from "effect"
import { jiraHandlers } from "../../tools/jira/main/electron"

export const bocDesktopHandlers = Layer.mergeAll(jiraHandlers)
export const bocDesktopServices = Layer.empty
