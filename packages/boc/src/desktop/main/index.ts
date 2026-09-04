import { Layer } from "effect"
import { deploymentHandlers } from "../../tools/deployments/main/electron"
import { jiraHandlers } from "../../tools/jira/main/electron"
import { worktreePreferenceHandlers } from "../../worktrees/desktop/electron"

export const bocDesktopHandlers = Layer.mergeAll(jiraHandlers, deploymentHandlers, worktreePreferenceHandlers)
export const bocDesktopServices = Layer.empty
