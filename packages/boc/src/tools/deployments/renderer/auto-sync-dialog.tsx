import { Button } from "@opencode/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { useDialog } from "@opencode/ui/context/dialog"
import { createSignal, Show } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentFailure, DeploymentSystem, DeploymentSystemsResult } from "../rpcs"
import { deploymentFailureMessage } from "./deployment-failure"

export function AutoSyncOffDialog(props: {
  t: BocTranslator
  system: DeploymentSystem
  run: () => Promise<DeploymentSystemsResult>
  onSuccess: (result: Extract<DeploymentSystemsResult, { ok: true }>) => void
}) {
  const dialog = useDialog()
  const [running, setRunning] = createSignal(false)
  const [failure, setFailure] = createSignal<DeploymentFailure>()

  const confirm = async () => {
    setRunning(true)
    setFailure(undefined)
    const result = await props.run().catch(() => undefined)
    setRunning(false)
    if (!result?.ok) {
      setFailure(result ?? { ok: false, category: "unknown", retryable: true })
      return
    }
    props.onSuccess(result)
    dialog.close()
  }

  return (
    <Dialog size="normal" data-boc-dialog="deployment-auto-sync-off">
      <DialogHeader closeLabel={props.t("boc.deployments.autoSync.confirm.close")} hideClose={running()}>
        <DialogTitleGroup
          title={props.t("boc.deployments.autoSync.confirm.title")}
          description={props.t("boc.deployments.autoSync.confirm.description", { system: props.system.name })}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-3 px-4 pb-4">
        <Show when={failure()}>
          {(value) => <p class="text-v2-state-fg-danger">{deploymentFailureMessage(props.t, value())}</p>}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" disabled={running()} onClick={() => dialog.close()}>
          {props.t("boc.deployments.autoSync.confirm.cancel")}
        </Button>
        <Button type="button" variant="contrast" disabled={running()} onClick={() => void confirm()}>
          {running()
            ? props.t("boc.deployments.autoSync.confirm.running")
            : props.t("boc.deployments.action.autoSync.off")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
