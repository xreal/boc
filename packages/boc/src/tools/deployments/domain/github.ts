export const DEPLOYMENT_GITHUB_OWNER = "bergfreunde"
export const DEPLOYMENT_GITHUB_REPO = "shop"
export const DEPLOYMENT_GITHUB_REPOSITORY = `${DEPLOYMENT_GITHUB_OWNER}/${DEPLOYMENT_GITHUB_REPO}`
export const DEPLOYMENT_ACTIONS_URL = `https://github.com/${DEPLOYMENT_GITHUB_REPOSITORY}/actions`

export function deploymentWorkflowUrl(workflow: { filename: string; runId?: string }) {
  return workflow.runId && /^\d+$/.test(workflow.runId)
    ? `${DEPLOYMENT_ACTIONS_URL}/runs/${workflow.runId}`
    : `${DEPLOYMENT_ACTIONS_URL}/workflows/${encodeURIComponent(workflow.filename)}`
}
