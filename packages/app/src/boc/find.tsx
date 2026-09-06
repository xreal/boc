import { createBocTranslator } from "@boc/extensions/renderer"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { useLocation } from "@solidjs/router"
import { createEffect, on, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { useCommand } from "@/shell/commands/command"
import { pageMatches } from "./page-matches"
import "./find.css"

export function BocFindBar() {
  const language = useLanguage()
  const t = createBocTranslator(language.locale)
  const command = useCommand()
  const location = useLocation()
  const [state, setState] = createStore({ open: false, text: "", active: 0, total: 0 })
  let input: HTMLInputElement | undefined
  let bar: HTMLDivElement | undefined
  let previousFocus: HTMLElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let matches: Range[] = []

  const highlight = () => {
    CSS.highlights.set("boc-find", new Highlight(...matches))
    CSS.highlights.set("boc-find-active", new Highlight(...matches.slice(state.active - 1, state.active)))
  }
  const reveal = () => {
    const range = matches[state.active - 1]
    if (!range) return
    let element = range.startContainer.parentElement
    while (element) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        const target = range.getBoundingClientRect()
        const viewport = element.getBoundingClientRect()
        element.scrollBy({
          top: target.top - viewport.top - element.clientHeight / 2 + target.height / 2,
          behavior: "instant",
        })
      }
      element = element.parentElement
    }
  }
  const search = (scroll = true) => {
    clearTimeout(timer)
    timer = undefined
    if (!bar) return
    matches = pageMatches(document.body, state.text, bar)
    setState({
      total: matches.length,
      active: matches.length ? Math.max(1, Math.min(state.active, matches.length)) : 0,
    })
    highlight()
    if (scroll) reveal()
  }
  const move = (direction: number) => {
    if (timer) return search()
    search(false)
    if (!matches.length) return
    setState("active", ((state.active - 1 + direction + matches.length) % matches.length) + 1)
    highlight()
    reveal()
  }
  const clear = () => {
    clearTimeout(timer)
    timer = undefined
    matches = []
    CSS.highlights.delete("boc-find")
    CSS.highlights.delete("boc-find-active")
  }
  const close = () => {
    clear()
    setState("open", false)
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
  const open = () => {
    if (!state.open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      setState("open", true)
    }
    input?.focus()
    input?.select()
  }

  command.register("boc.find", () => [{ id: "boc.find", title: t("boc.find.title"), keybind: "mod+f", onSelect: open }])
  createEffect(
    on(
      () => location.pathname,
      () => {
        if (state.open) close()
      },
      { defer: true },
    ),
  )
  createEffect(
    on(
      () => state.open,
      (open) => {
        if (!open) return
        search(false)
        const observer = new MutationObserver((mutations) => {
          if (mutations.every((mutation) => bar?.contains(mutation.target))) return
          clearTimeout(timer)
          timer = setTimeout(() => search(false), 150)
        })
        observer.observe(document.body, {
          childList: true,
          characterData: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["hidden", "open", "aria-expanded"],
        })
        onCleanup(() => observer.disconnect())
      },
    ),
  )
  onCleanup(clear)

  return (
    <Show when={state.open}>
      <div
        ref={bar}
        role="search"
        aria-label={t("boc.find.title")}
        class="boc-find-bar"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            close()
          }
          if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault()
            event.stopPropagation()
            move(event.shiftKey ? -1 : 1)
          }
        }}
      >
        <div class="boc-find-controls">
          <input
            ref={input}
            type="search"
            maxLength={4096}
            aria-label={t("boc.find.title")}
            placeholder={t("boc.find.placeholder")}
            class="boc-find-input"
            title={t("boc.find.scope")}
            value={state.text}
            onInput={(event) => {
              clear()
              setState({ text: event.currentTarget.value, active: 0, total: 0 })
              timer = setTimeout(() => search(), 150)
            }}
          />
          <span role="status" class="boc-find-count">
            {t("boc.find.result", { active: state.active, total: state.total })}
          </span>
          <span class="boc-find-divider" aria-hidden="true" />
          <IconButton
            variant="ghost"
            icon={<Icon name="chevron-down" size="large" class="boc-find-previous" />}
            aria-label={t("boc.find.previous")}
            title={t("boc.find.previous")}
            disabled={!state.total}
            onClick={() => move(-1)}
          />
          <IconButton
            variant="ghost"
            icon={<Icon name="chevron-down" size="large" />}
            aria-label={t("boc.find.next")}
            title={t("boc.find.next")}
            disabled={!state.total}
            onClick={() => move(1)}
          />
          <IconButton
            variant="ghost"
            icon={<Icon name="close" size="large" />}
            aria-label={t("boc.find.close")}
            title={t("boc.find.close")}
            onClick={close}
          />
        </div>
      </div>
    </Show>
  )
}
