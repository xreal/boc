import { Layer } from "effect"
import { deploymentHandlers } from "../../tools/deployments/main/electron"
import { jiraHandlers } from "../../tools/jira/main/electron"

export const bocDesktopHandlers = Layer.mergeAll(jiraHandlers, deploymentHandlers)
export const bocDesktopServices = Layer.empty
