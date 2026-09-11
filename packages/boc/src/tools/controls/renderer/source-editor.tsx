import { Button } from "@opencode/ui/button"
import { DialogTitle } from "@opencode/ui/dialog"
import { onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import type { BocControls, ControlItem, ControlsHost, ControlsSelection } from "../host"
import "./configuration-editor.css"
import { EditorPanel } from "./editor-panel"

export function SourceEditor(props: {
  host: ControlsHost
  selection: ControlsSelection
  scope: BocControls.ConfigurationScope
  kind: BocControls.SourceKind
  item?: ControlItem
  t: BocTranslator
  close: () => void
  saved: () => void
  canDelete: boolean
  skills: readonly ControlItem[]
}) {
  const [view, setView] = createStore({
    source: undefined as BocControls.Source | undefined,
    scope: props.scope,
    name: props.kind === "instruction" ? "AGENTS.md" : "",
    description: "",
    content: "",
    loading: !!props.item,
    saving: false,
    saved: false,
    closing: false,
    deleting: false,
    error: "" as "" | "error" | "conflict" | "invalidSource" | "sourceReadOnly",
  })
  const abort = new AbortController()
  const connection = props.host.connect(props.selection.server)
  const identity = connection?.identity()
  const options = () => ({
    location: { directory: props.selection.directory },
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
  })
  const dirty = () =>
    view.source
      ? view.content !== view.source.content
      : !!(view.content || view.description || (props.kind === "skill" && view.name))
  const alreadyAvailable = () =>
    !view.source &&
    props.kind === "skill" &&
    props.skills.some(
      (skill) => skill.id === view.name.trim() && (view.scope === "project" || skill.origin !== "project"),
    )
  const close = () => {
    if (view.saving) return
    if (dirty()) {
      setView("closing", true)
      return
    }
    props.close()
  }
  const failure = (error: unknown) => {
    const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined
    setView(
      "error",
      type === "conflict"
        ? "conflict"
        : type === "invalid_source"
          ? "invalidSource"
          : type === "not_supported"
            ? "sourceReadOnly"
            : "error",
    )
  }
  const load = async () => {
    if (!connection || !props.item) return
    setView({ loading: true, error: "" })
    try {
      const source = await connection.client().getSource({ kind: props.kind, id: props.item.id }, options())
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) throw new Error("boc.controls.connection_changed")
      setView({ source, content: source.content, scope: source.scope })
    } catch (error) {
      if (!abort.signal.aborted) failure(error)
    } finally {
      if (!abort.signal.aborted) setView("loading", false)
    }
  }
  const save = async () => {
    if (!connection || view.saving || (props.item && !view.source)) return
    if (identity !== connection.identity()) {
      setView("error", "error")
      return
    }
    setView({ saving: true, error: "" })
    try {
      const source = view.source
        ? await connection
            .client()
            .saveSource(
              { kind: props.kind, id: view.source.id, content: view.content, expectedRevision: view.source.revision },
              options(),
            )
        : await connection.client().createSource(
            {
              kind: props.kind,
              scope: view.scope,
              name: view.name.trim(),
              content:
                props.kind === "skill"
                  ? `---\nname: ${JSON.stringify(view.name.trim())}\ndescription: ${JSON.stringify(view.description.trim())}\n---\n\n${view.content}\n`
                  : view.content,
            },
            options(),
          )
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) throw new Error("boc.controls.connection_changed")
      setView({ source, content: source.content, saved: true })
      props.saved()
    } catch (error) {
      if (!abort.signal.aborted) failure(error)
    } finally {
      if (!abort.signal.aborted) setView("saving", false)
    }
  }
  const remove = async () => {
    if (!connection || !view.source || view.saving) return
    setView({ saving: true, error: "" })
    try {
      await connection
        .client()
        .deleteSource({ kind: props.kind, id: view.source.id, expectedRevision: view.source.revision }, options())
      if (abort.signal.aborted) return
      props.saved()
      props.close()
    } catch (error) {
      if (!abort.signal.aborted) failure(error)
    } finally {
      if (!abort.signal.aborted) setView("saving", false)
    }
  }
  onMount(() => {
    void load()
  })
  onCleanup(() => {
    abort.abort()
  })

  return (
    <EditorPanel close={close}>
      <header>
        <div>
          <DialogTitle>
            {props.item?.name ??
              props.t(
                props.kind === "skill" ? "boc.controls.editor.createSkill" : "boc.controls.editor.createInstructions",
              )}
          </DialogTitle>
          <p>
            {props.t(
              view.scope === "global" ? "boc.controls.editor.sourceHint" : "boc.controls.editor.localSourceHint",
            )}
          </p>
        </div>
        <Button variant="ghost" size="small" disabled={view.saving} onClick={close}>
          {props.t("boc.controls.editor.cancel")}
        </Button>
      </header>
      <div class="controls-editor-body">
        <Show when={view.loading}>
          <p role="status">{props.t("boc.controls.editor.loading")}</p>
        </Show>
        <Show when={!view.loading && (!props.item || view.source)}>
          <Show when={view.source}>
            <p class="controls-editor-path">
              <bdi dir="ltr">{view.source?.path}</bdi>
            </p>
          </Show>
          <Show when={!view.source && props.kind === "skill"}>
            <label class="controls-editor-field">
              <span>{props.t("boc.controls.editor.skillName")}</span>
              <input
                value={view.name}
                disabled={view.saving}
                onInput={(event) => setView("name", event.currentTarget.value)}
              />
            </label>
            <label class="controls-editor-field">
              <span>{props.t("boc.controls.editor.description")}</span>
              <input
                value={view.description}
                disabled={view.saving}
                onInput={(event) => setView("description", event.currentTarget.value)}
              />
            </label>
          </Show>
          <label class="controls-editor-field controls-editor-markdown-field">
            <span>{props.t("boc.controls.editor.markdown")}</span>
            <textarea
              class="controls-editor-code controls-editor-markdown"
              dir="auto"
              spellcheck={false}
              value={view.content}
              disabled={view.saving}
              onInput={(event) => setView({ content: event.currentTarget.value, saved: false })}
            />
          </label>
        </Show>
      </div>
      <footer>
        <div role="status" aria-live="polite">
          <Show when={view.error}>
            <p class="controls-editor-error">{props.t(`boc.controls.editor.${view.error || "error"}`)}</p>
          </Show>
          <Show when={view.saved}>
            <p class="controls-editor-success">{props.t("boc.controls.editor.sourceSaved")}</p>
          </Show>
          <Show when={view.closing && dirty()}>
            <p>{props.t("boc.controls.editor.unsaved")}</p>
          </Show>
          <Show when={view.deleting}>
            <p class="controls-editor-danger">{props.t("boc.controls.editor.deleteHint")}</p>
          </Show>
          <Show when={alreadyAvailable()}>
            <p>{props.t("boc.controls.editor.alreadyAvailable")}</p>
          </Show>
        </div>
        <div class="controls-editor-buttons">
          <Show when={props.canDelete && view.source}>
            <Button
              variant={view.deleting ? "danger" : "ghost"}
              disabled={view.saving || dirty()}
              onClick={() => {
                if (view.deleting) {
                  void remove()
                  return
                }
                setView({ deleting: true, saved: false })
              }}
            >
              {props.t(view.deleting ? "boc.controls.editor.confirmDelete" : "boc.controls.editor.delete")}
            </Button>
            <Show when={view.deleting}>
              <Button variant="outline" disabled={view.saving} onClick={() => setView("deleting", false)}>
                {props.t("boc.controls.editor.keep")}
              </Button>
            </Show>
          </Show>
          <Show when={view.closing && dirty()}>
            <Button variant="outline" disabled={view.saving} onClick={props.close}>
              {props.t("boc.controls.editor.discard")}
            </Button>
          </Show>
          <Button
            disabled={
              view.loading ||
              view.saving ||
              !dirty() ||
              alreadyAvailable() ||
              (!!props.item && !view.source) ||
              (!view.source && props.kind === "skill" && (!view.name.trim() || !view.description.trim()))
            }
            onClick={() => void save()}
          >
            {props.t(view.saving ? "boc.controls.editor.saving" : "boc.controls.editor.save")}
          </Button>
        </div>
      </footer>
    </EditorPanel>
  )
}
