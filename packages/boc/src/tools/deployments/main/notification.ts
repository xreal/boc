import { Notification, shell } from "electron"
import type { DeploymentOperationSummary } from "../domain/operations"
import { deploymentWorkflowUrl, DEPLOYMENT_ACTIONS_URL } from "../domain/github"
import { nativeT } from "../i18n/native"

const notifications = new Set<Notification>()

export function notifyDeploymentFinished(operation: DeploymentOperationSummary) {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: nativeT("boc.deployments.notification.title", {
      system: `dev-${operation.environment}`,
      state: nativeT(`boc.deployments.operation.${operation.state}`),
    }),
    body: nativeT("boc.deployments.notification.body", { branch: operation.branch }),
  })
  notifications.add(notification)
  const release = () => notifications.delete(notification)
  notification.on("close", release)
  notification.on("failed", release)
  notification.on("click", () => {
    const workflow = operation.workflows.find((item) => item.state !== "success") ?? operation.workflows[0]
    void shell.openExternal(workflow ? deploymentWorkflowUrl(workflow) : DEPLOYMENT_ACTIONS_URL).catch(() => undefined)
    notification.close()
    release()
  })
  notification.show()
}
