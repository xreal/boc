import { createBocTranslator } from "@boc/extensions/renderer"
import { Button } from "@opencode/ui/button"
import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { showToast } from "@/shell/notifications/toast"
import type { EnvironmentResource } from "./store"
import { downloadEnvironmentOutput } from "./terminal-output"

export function EnvironmentContainerLogs(props: { containerID: string; resource: EnvironmentResource }) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const [view, setView] = createStore({
    text: "",
    search: "",
    following: true,
    failed: false,
    loading: true,
    wrap: true,
  })
  let element: HTMLPreElement | undefined
  createEffect(() => {
    const id = props.containerID
    const following = view.following
    if (!following) return
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async () => {
      const result = await props.resource.logs(id).catch(() => undefined)
      if (disposed) return
      setView({ loading: false, failed: !result?.available })
      if (result?.available)
        setView(
          "text",
          result.text
            .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
            .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
            .replace(/[^\n\x20-\x7e\xa0-\uffff\t]/g, ""),
        )
      if (following) timer = setTimeout(() => void refresh(), 2_000)
    }
    void refresh()
    onCleanup(() => {
      disposed = true
      clearTimeout(timer)
    })
  })
  createEffect(() => {
    props.containerID
    setView({ text: "", search: "", loading: true, failed: false, following: true })
  })
  const text = createMemo(() =>
    view.search
      ? view.text
          .split("\n")
          .filter((line) => line.toLowerCase().includes(view.search.toLowerCase()))
          .join("\n")
      : view.text,
  )
  createEffect(() => {
    text()
    if (!view.following || !element) return
    const frame = requestAnimationFrame(() => {
      if (element) element.scrollTop = element.scrollHeight
    })
    onCleanup(() => cancelAnimationFrame(frame))
  })
  const copy = () =>
    void (platform.writeClipboardText?.(text()) ?? navigator.clipboard.writeText(text())).then(
      () => showToast({ variant: "success", title: language.t("common.copied") }),
      () => showToast({ variant: "error", title: language.t("common.requestFailed") }),
    )
  return (
    <div class="boc-environment-output">
      <div class="boc-environment-output-tools">
        <input
          type="search"
          value={view.search}
          onInput={(event) => setView("search", event.currentTarget.value)}
          placeholder={t("boc.environments.logs.search")}
          aria-label={t("boc.environments.logs.search")}
        />
        <div>
          <Button variant="ghost" size="small" aria-pressed={view.wrap} onClick={() => setView("wrap", !view.wrap)}>
            {t("boc.environments.logs.wrap")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            aria-pressed={view.following}
            onClick={() => setView("following", !view.following)}
          >
            {t(view.following ? "boc.environments.output.following" : "boc.environments.output.jump")}
          </Button>
          <Button variant="ghost" size="small" disabled={!text()} onClick={copy}>
            {t("boc.environments.output.copy")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            disabled={!text()}
            onClick={() => downloadEnvironmentOutput(text(), "container-logs.txt")}
          >
            {t("boc.environments.output.save")}
          </Button>
        </div>
      </div>
      <pre
        ref={element}
        class="boc-environment-container-log"
        classList={{ "boc-wrap": view.wrap }}
        dir="ltr"
        role="log"
        aria-label={t("boc.environments.logs.title")}
        aria-live="off"
        tabIndex={0}
        onScroll={(event) => {
          const log = event.currentTarget
          if (log.scrollHeight - log.scrollTop - log.clientHeight > 12) setView("following", false)
        }}
      >
        {text() ||
          t(
            view.loading
              ? "boc.environments.logs.loading"
              : view.search
                ? "boc.environments.logs.noMatches"
                : "boc.environments.logs.empty",
          )}
      </pre>
      <div class="boc-environment-output-note" role={view.failed ? "alert" : undefined}>
        <Show when={view.failed} fallback={t("boc.environments.logs.tail")}>
          {t("boc.environments.logs.failed")}
        </Show>
      </div>
    </div>
  )
}
