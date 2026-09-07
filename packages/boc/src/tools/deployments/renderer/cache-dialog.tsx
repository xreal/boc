import { Button } from "@opencode-ai/ui/button"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode-ai/ui/dialog"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Show, createSignal, onCleanup, onMount } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"
import type { DeploymentCacheRunSnapshot, DeploymentFailure, DeploymentSystem } from "../rpcs"
import { cacheFailureMessage } from "./deployment-failure"

type CacheApiResult =
  | { ok: true; run?: DeploymentCacheRunSnapshot }
  | DeploymentFailure

export function CacheDialog(props: {
  t: BocTranslator
  system: DeploymentSystem
  get: () => Promise<CacheApiResult>
  start: () => Promise<CacheApiResult>
  resolve: (startedAt: string) => Promise<CacheApiResult>
  onUpdate: (run?: DeploymentCacheRunSnapshot) => void
}) {
  const dialog = useDialog()
  const [run, setRun] = createSignal<DeploymentCacheRunSnapshot>()
  const [failure, setFailure] = createSignal<DeploymentFailure>()
  const [loading, setLoading] = createSignal(true)
  const [readReady, setReadReady] = createSignal(false)
  const [failurePhase, setFailurePhase] = createSignal<"read" | "start" | "resolve">("read")
  const [submitting, setSubmitting] = createSignal(false)
  const [confirmAgain, setConfirmAgain] = createSignal(false)
  const [confirmResolution, setConfirmResolution] = createSignal(false)
  const [copyState, setCopyState] = createSignal<"copied" | "failed">()
  let output: HTMLPreElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const updateRun = (next?: DeploymentCacheRunSnapshot) => {
    if (disposed) return
    const follow = !output || output.scrollHeight - output.scrollTop - output.clientHeight < 24
    setRun(next)
    props.onUpdate(next)
    if (follow) queueMicrotask(() => {
      if (!disposed && output) output.scrollTop = output.scrollHeight
    })
  }

  const load = async () => {
    clearTimeout(timer)
    setLoading(true)
    setFailure(undefined)
    const result = await props.get().catch(() => undefined)
    if (disposed) return
    setLoading(false)
    if (!result?.ok) {
      setReadReady(false)
      setFailurePhase("read")
      setFailure(result ?? { ok: false, category: "unknown", retryable: true })
      return
    }
    setReadReady(true)
    updateRun(result.run)
    if (result.run?.state === "running") timer = setTimeout(() => void load(), 750)
  }
  const confirm = async () => {
    if (submitting()) return
    setSubmitting(true)
    setFailure(undefined)
    setFailurePhase("start")
    setConfirmAgain(false)
    const result = await props.start().catch(() => undefined)
    if (disposed) return
    setSubmitting(false)
    if (!result?.ok) {
      setFailure(result ?? { ok: false, category: "unknown", retryable: true })
      return
    }
    updateRun(result.run)
    if (result.run?.state === "running") timer = setTimeout(() => void load(), 250)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(run()?.output ?? "")
      if (!disposed) setCopyState("copied")
    } catch {
      if (!disposed) setCopyState("failed")
    }
  }
  const resolveUnknown = async () => {
    const current = run()
    if (!current || current.state !== "unknown" || submitting()) return
    setSubmitting(true)
    setFailure(undefined)
    setFailurePhase("resolve")
    const result = await props.resolve(current.startedAt).catch(() => undefined)
    if (disposed) return
    setSubmitting(false)
    setConfirmResolution(false)
    if (!result?.ok) {
      setFailure(result ?? { ok: false, category: "unknown", retryable: true })
      return
    }
    updateRun(result.run)
  }

  onMount(() => void load())
  onCleanup(() => {
    disposed = true
    clearTimeout(timer)
  })

  return (
    <Dialog size="large" data-boc-dialog="deployment-clear-cache">
      <DialogHeader closeLabel={props.t("boc.deployments.cache.close")}>
        <DialogTitleGroup
          title={props.t("boc.deployments.cache.title", { system: props.system.name })}
          description={props.t("boc.deployments.cache.description", { system: props.system.name })}
        />
      </DialogHeader>
      <DialogBody class="flex min-h-64 flex-col gap-3 px-4 pb-4">
        <Show when={failure()}>
          {(value) => <p role="alert" class="text-v2-state-fg-danger">{cacheFailureMessage(props.t, failurePhase(), value())}</p>}
        </Show>
        <Show when={failure() && failurePhase() === "read"}>
          <Button type="button" variant="outline" disabled={loading()} onClick={() => void load()}>
            {props.t("boc.deployments.cache.retryRead")}
          </Button>
        </Show>
        <Show when={loading()}><p role="status">{props.t("boc.deployments.cache.loading")}</p></Show>
        <Show when={run()}>
          {(value) => (
            <>
              <p role="status" class="text-[13px] [font-weight:530]">
                {props.t(`boc.deployments.cache.state.${value().state}`)}
              </p>
              <Show when={value().state === "unknown"}>
                <p class="text-v2-state-fg-warning">{props.t("boc.deployments.cache.unknownWarning")}</p>
              </Show>
              <pre ref={output} class="min-h-48 max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-md border border-v2-border-border-muted bg-v2-background-bg-layer-01 p-3 font-mono text-[12px]">
                {value().output || props.t("boc.deployments.cache.waiting")}
              </pre>
            </>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Show when={run()}>
          <Button type="button" variant="outline" onClick={() => void copy()}>
            {props.t("boc.deployments.cache.copy")}
          </Button>
          <Show when={copyState()}>
            {(state) => <span role="status">{props.t(`boc.deployments.cache.copy.${state()}`)}</span>}
          </Show>
        </Show>
        <Button type="button" variant="outline" onClick={() => dialog.close()}>
          {props.t("boc.deployments.cache.closeButton")}
        </Button>
        <Show when={readReady() && !loading() && run()?.state !== "running" && run()?.state !== "unknown"}>
          <Button type="button" variant="contrast" disabled={submitting()} onClick={() => run() ? setConfirmAgain(true) : void confirm()}>
            {submitting() ? props.t("boc.deployments.cache.starting") : props.t("boc.deployments.action.clearCache")}
          </Button>
        </Show>
        <Show when={confirmAgain()}>
          <Button type="button" variant="contrast" disabled={submitting()} onClick={() => void confirm()}>
            {props.t("boc.deployments.cache.confirmAgain")}
          </Button>
        </Show>
        <Show when={run()?.state === "unknown" && !confirmResolution()}>
          <Button type="button" variant="outline" onClick={() => setConfirmResolution(true)}>
            {props.t("boc.deployments.cache.resolve")}
          </Button>
        </Show>
        <Show when={confirmResolution()}>
          <Button type="button" variant="contrast" disabled={submitting()} onClick={() => void resolveUnknown()}>
            {props.t("boc.deployments.cache.resolveConfirm")}
          </Button>
        </Show>
      </DialogFooter>
    </Dialog>
  )
}
