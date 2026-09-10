import { createBocTranslator } from "@boc/extensions/renderer"
import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { Button } from "@opencode/ui/button"
import { useTheme } from "@opencode/ui/theme/context"
import type { FitAddon, Ghostty, Terminal } from "ghostty-web"
import { createEffect, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { terminalWriter } from "@/session/terminal/writer"
import { showToast } from "@/shell/notifications/toast"
import { createEnvironmentOutputCursor } from "./output"

let engine: Promise<Ghostty> | undefined

export function EnvironmentTerminalOutput(props: {
  run?: BocEnvironment.Run
  resize: (runID: string, cols: number, rows: number) => Promise<boolean>
}) {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const platform = usePlatform()
  const theme = useTheme()
  const [view, setView] = createStore({ ready: false, failed: false, following: true, text: "" })
  const consume = createEnvironmentOutputCursor()
  let container: HTMLDivElement | undefined
  let terminal: Terminal | undefined
  let fit: FitAddon | undefined
  let disposed = false
  let dimensions = ""
  let writing = false
  const writer = terminalWriter((data, done) => {
    if (!terminal || disposed) return done?.()
    const following = view.following
    const viewport = terminal.getViewportY()
    const scrollback = terminal.getScrollbackLength()
    writing = true
    terminal.write(data, () => {
      if (disposed || !terminal) return done?.()
      const buffer = terminal.buffer.active
      setView(
        "text",
        Array.from({ length: buffer.length }, (_, row) => buffer.getLine(row)?.translateToString(true) ?? "")
          .join("\n")
          .trimEnd(),
      )
      if (view.following) terminal.scrollToBottom()
      done?.()
    })
    if (!following) terminal.scrollToLine(viewport + Math.max(0, terminal.getScrollbackLength() - scrollback))
    writing = false
  })

  const resize = () => {
    if (!terminal || !container || !view.ready || !container.clientWidth || !container.clientHeight) return
    fit?.fit()
    const run = props.run
    const next = `${run?.id}:${terminal.cols}:${terminal.rows}`
    if (run?.status !== "running" || dimensions === next) return
    dimensions = next
    void props.resize(run.id, terminal.cols, terminal.rows).then(
      (accepted) => {
        if (!accepted && dimensions === next) dimensions = ""
      },
      () => {
        if (dimensions === next) dimensions = ""
      },
    )
  }

  onMount(() => {
    const load = async () => {
      const mod = await import("ghostty-web")
      engine ??= mod.Ghostty.load().catch((error) => {
        engine = undefined
        throw error
      })
      const ghostty = await engine
      if (disposed || !container) return
      terminal = new mod.Terminal({
        ghostty,
        cols: 80,
        rows: 24,
        fontSize: 12,
        fontFamily: getComputedStyle(container).fontFamily,
        disableStdin: true,
        cursorBlink: false,
        scrollback: 2000,
        convertEol: true,
      })
      fit = new mod.FitAddon()
      terminal.loadAddon(fit)
      const focused = document.activeElement
      terminal.open(container)
      const surface = container.querySelector('[role="textbox"]')
      surface?.setAttribute("aria-label", t("boc.environments.output.readOnly"))
      surface?.setAttribute("aria-readonly", "true")
      terminal.textarea?.setAttribute("aria-label", t("boc.environments.output.readOnly"))
      if (focused instanceof HTMLElement) focused.focus({ preventScroll: true })
      terminal.onScroll(() => {
        if (!writing) setView("following", (terminal?.getViewportY() ?? 0) < 1)
      })
      setView("ready", true)
      resize()
    }
    void load().catch(() => {
      if (!disposed) setView("failed", true)
    })
    const observer = new ResizeObserver(resize)
    if (container) observer.observe(container)
    onCleanup(() => observer.disconnect())
  })

  createEffect(() => {
    if (!view.ready || !props.run) return
    const next = consume(props.run)
    if (next.reset) {
      writer.push("\x1bc")
      setView("following", true)
    }
    writer.push(next.data)
    resize()
  })
  createEffect(() => {
    theme.mode()
    if (!view.ready || !terminal || !container) return
    const style = getComputedStyle(container)
    terminal.options.theme = {
      background: style.backgroundColor,
      foreground: style.color,
      cursor: style.backgroundColor,
    }
  })
  onCleanup(() => {
    disposed = true
    fit?.dispose()
    terminal?.dispose()
  })

  const copy = () =>
    void (platform.writeClipboardText?.(view.text) ?? navigator.clipboard.writeText(view.text)).then(
      () => showToast({ variant: "success", title: language.t("common.copied") }),
      () => showToast({ variant: "error", title: language.t("common.requestFailed") }),
    )

  return (
    <div class="boc-environment-output">
      <div class="boc-environment-output-tools">
        <span>{t("boc.environments.output.command")}</span>
        <div>
          <Button
            variant="ghost"
            size="small"
            disabled={!view.ready}
            onClick={() => {
              setView("following", !view.following)
              if (view.following) terminal?.scrollToBottom()
            }}
            aria-pressed={view.following}
          >
            {t(view.following ? "boc.environments.output.following" : "boc.environments.output.jump")}
          </Button>
          <Button variant="ghost" size="small" disabled={!view.text} onClick={copy}>
            {t("boc.environments.output.copy")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            disabled={!view.text}
            onClick={() => downloadEnvironmentOutput(view.text, "environment-output.txt")}
          >
            {t("boc.environments.output.save")}
          </Button>
        </div>
      </div>
      <div class="boc-environment-terminal-wrap">
        <div ref={container} class="boc-environment-terminal" dir="ltr" />
        <pre class="sr-only" role="log" aria-live="off" dir="ltr" aria-label={t("boc.environments.details.output")}>
          {view.text}
        </pre>
        <Show when={!props.run?.log || view.failed || !view.ready}>
          <p class="boc-environment-output-empty">
            {t(
              view.failed
                ? "boc.environments.output.failed"
                : !view.ready
                  ? "boc.environments.output.loading"
                  : "boc.environments.details.noOutput",
            )}
          </p>
        </Show>
      </div>
      <div class="boc-environment-output-note">
        {props.run?.truncated ? t("boc.environments.details.outputTruncated") : t("boc.environments.output.readOnly")}
      </div>
    </div>
  )
}

export function downloadEnvironmentOutput(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
