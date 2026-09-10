import { Button } from "@opencode/ui/button"
import { DialogTitle } from "@opencode/ui/dialog"
import { applyEdits, findNodeAtLocation, getNodeValue, modify, parseTree, type ParseError } from "jsonc-parser"
import { createMemo, For, onCleanup, onMount, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { BocTranslator } from "../../../renderer/i18n"
import type { BocControls, ControlItem, ControlsHost, ControlsSelection } from "../host"
import "./configuration-editor.css"
import { EditorPanel } from "./editor-panel"
import { Choice } from "./choice"
import { ModelPicker } from "./model-picker"

type Scope = BocControls.ConfigurationScope
type Category = "agent" | "mcp" | "skill" | "tool" | "instruction"

export function ConfigurationEditor(props: {
  host: ControlsHost
  selection: ControlsSelection
  scope: Scope
  item?: ControlItem
  add: boolean
  t: BocTranslator
  close: () => void
  saved: () => void
  createSource?: (kind: BocControls.SourceKind, scope: Scope) => void
  agents: readonly ControlItem[]
  instructions: readonly ControlItem[]
  editSource: (item: ControlItem) => void
}) {
  const [view, setView] = createStore({
    scope: props.scope,
    document: undefined as BocControls.Configuration | undefined,
    content: "",
    category: (props.item?.kind === "mcp" ? "mcp" : props.item?.kind === "skill" ? "skill" : "agent") as Category,
    id: props.item?.id ?? "",
    name: "",
    loading: true,
    saving: false,
    advanced: false,
    code: "",
    invalidCode: false,
    error: "" as "" | "error" | "conflict" | "invalid",
    saved: false,
    closing: false,
  })
  const abort = new AbortController()
  const connection = props.host.connect(props.selection.server)
  const identity = connection?.identity()
  const options = () => ({
    location: { directory: props.selection.directory },
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)]),
  })
  const dirty = () => !!view.document && (view.document.content !== view.content || view.invalidCode)
  const parsed = createMemo(() => {
    const errors: ParseError[] = []
    const tree = parseTree(view.content, errors, { allowTrailingComma: true })
    return { tree, valid: !!tree && tree.type === "object" && errors.length === 0 }
  })
  const node = (path: (string | number)[]) => parsed().tree && findNodeAtLocation(parsed().tree!, path)
  const value = (path: (string | number)[]): unknown => {
    const found = node(path)
    if (found) return getNodeValue(found)
    const server = path[0] === "mcp" && path[1] === "servers" ? view.document?.mcp?.[String(path[2])] : undefined
    return server && path.length === 4 ? Reflect.get(server, path[3]!) : undefined
  }
  const text = (path: (string | number)[]) => {
    const found = value(path)
    return typeof found === "string" ? found : ""
  }
  const lines = (path: string[]) => {
    const found = value(path)
    return Array.isArray(found) && found.every((item) => typeof item === "string") ? found.join("\n") : ""
  }
  const root = () => (view.category === "mcp" ? ["mcp", "servers"] : ["agents"])
  const definition = () => [...root(), view.id]
  const model = () => {
    const configured = text([...definition(), "model"])
    if (configured) return configured
    const provider = text([...definition(), "model", "providerID"])
    const id = text([...definition(), "model", "model"])
    const variant = text([...definition(), "model", "variant"])
    return provider && id ? `${provider}/${id}${variant ? `#${variant}` : ""}` : ""
  }
  const definitions = () =>
    node(root())?.children?.flatMap((property) =>
      property.children?.[0]?.value ? [String(property.children[0].value)] : [],
    ) ?? []
  const openCode = () => {
    const existing = node(definition())
    setView({
      advanced: true,
      code: existing
        ? view.content.slice(existing.offset, existing.offset + existing.length)
        : JSON.stringify(view.category === "mcp" ? (view.document?.mcp?.[view.id] ?? {}) : {}, null, 2),
    })
  }
  const updateCode = (content: string) => {
    if (!props.item) {
      setView({ content, saved: false, error: "" })
      return
    }
    const errors: ParseError[] = []
    const tree = parseTree(content, errors, { allowTrailingComma: true })
    setView({ code: content, invalidCode: !tree || tree.type !== "object" || errors.length > 0, saved: false })
    if (view.invalidCode || !parsed().valid) return
    const document = node(definition())
      ? view.content
      : applyEdits(
          view.content,
          modify(view.content, definition(), {}, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
        )
    const target = findNodeAtLocation(parseTree(document)!, definition())
    if (target)
      setView("content", document.slice(0, target.offset) + content + document.slice(target.offset + target.length))
  }
  const ids = () => [
    ...new Set([
      ...definitions(),
      ...(view.category === "mcp" ? Object.keys(view.document?.mcp ?? {}) : []),
      ...(view.id ? [view.id] : []),
    ]),
  ]
  const definitionExists = (name: string) =>
    definitions().includes(name) ||
    (view.category === "agent"
      ? props.agents.some((agent) => agent.id === name && (view.scope === "project" || agent.origin !== "project"))
      : ids().includes(name))
  const existingInstruction = () => {
    const directory =
      view.scope === "project" ? props.selection.directory : view.document?.path.replace(/[/\\][^/\\]+$/, "")
    if (!directory) return
    const target = `${directory.replace(/[\\]/g, "/").replace(/\/$/, "")}/AGENTS.md`
    return props.instructions.find((item) => item.source.replace(/[\\]/g, "/") === target)
  }
  const update = (path: (string | number)[], value: unknown) => {
    if (!parsed().valid || view.saving) return
    // MCP entries replace earlier definitions. Start from the complete inherited server, including OAuth and headers.
    const inherited =
      path[0] === "mcp" && path[1] === "servers" && path.length > 3 && !node(path.slice(0, 3))
        ? view.document?.mcp?.[String(path[2])]
        : undefined
    const content = inherited
      ? applyEdits(
          view.content,
          modify(view.content, path.slice(0, 3), inherited, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
        )
      : view.content
    setView({
      content: applyEdits(
        content,
        modify(content, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
      ),
      saved: false,
      error: "",
    })
  }
  const updateLines = (path: string[], content: string) =>
    update(
      path,
      content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    )
  const load = async (scope: Scope) => {
    if (!connection) {
      setView({ loading: false, error: "error" })
      return
    }
    setView({ scope, document: undefined, loading: true, error: "", saved: false })
    try {
      const document = await connection.client().getConfiguration({ scope }, options())
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) {
        setView({ loading: false, error: "error" })
        return
      }
      setView({ document, content: document.content, loading: false })
    } catch {
      if (!abort.signal.aborted) setView({ loading: false, error: "error" })
    }
  }
  const save = async () => {
    if (!connection || !view.document || view.saving || !parsed().valid || view.invalidCode) return
    if (identity !== connection.identity()) {
      setView("error", "error")
      return
    }
    setView({ saving: true, error: "" })
    try {
      const document = await connection
        .client()
        .saveConfiguration(
          { scope: view.scope, content: view.content, expectedRevision: view.document.revision },
          options(),
        )
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) {
        setView("error", "error")
        return
      }
      setView({ document, content: document.content, saved: true })
      props.saved()
    } catch (error) {
      const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined
      if (!abort.signal.aborted)
        setView(
          "error",
          type === "conflict"
            ? "conflict"
            : type === "invalid_configuration" || type === "invalid_config"
              ? "invalid"
              : "error",
        )
    } finally {
      if (!abort.signal.aborted) setView("saving", false)
    }
  }
  const close = () => {
    if (view.saving) return
    if (dirty()) {
      setView("closing", true)
      return
    }
    props.close()
  }
  onMount(() => {
    void load(view.scope)
  })
  onCleanup(() => {
    abort.abort()
  })

  return (
    <EditorPanel close={close}>
      <header>
        <div>
          <DialogTitle>
            {props.item
              ? props.t("boc.controls.editor.editTitle", { name: props.item.name })
              : props.t(props.add ? "boc.controls.editor.add" : "boc.controls.editor.title")}
          </DialogTitle>
          <Show when={!props.add}>
            <p>
              {props.t(
                view.scope === "global" ? "boc.controls.editor.globalSummary" : "boc.controls.editor.projectSummary",
              )}
            </p>
          </Show>
        </div>
        <Button variant="ghost" size="small" disabled={view.saving} onClick={close}>
          {props.t("boc.controls.editor.cancel")}
        </Button>
      </header>
      <div class="controls-editor-body">
        <Show when={!props.item}>
          <Field label={props.t("boc.controls.editor.scope")}>
            <Choice
              label={props.t("boc.controls.editor.scope")}
              value={view.scope}
              disabled={view.loading || view.saving || dirty()}
              options={[
                { value: "project", label: props.t("boc.controls.editor.project") },
                { value: "global", label: props.t("boc.controls.globalDefaults") },
              ]}
              onChange={(scope) => void load(scope as Scope)}
            />
          </Field>
        </Show>
        <Show when={view.loading}>
          <p role="status">{props.t("boc.controls.editor.loading")}</p>
        </Show>
        <Show when={!view.loading && !view.document && view.error}>
          <Button variant="outline" onClick={() => void load(view.scope)}>
            {props.t("boc.controls.editor.retryLoad")}
          </Button>
        </Show>
        <Show when={view.document && !view.loading}>
          <div class="controls-editor-tabs" role="group" aria-label={props.t("boc.controls.editor.title")}>
            <Button
              variant={view.advanced ? "ghost" : "outline"}
              size="small"
              onClick={() => setView("advanced", false)}
              disabled={view.invalidCode}
            >
              {props.t("boc.controls.editor.form")}
            </Button>
            <Button variant={view.advanced ? "outline" : "ghost"} size="small" onClick={openCode}>
              {props.t("boc.controls.editor.advanced")}
            </Button>
          </div>
          <Show
            when={!view.advanced && parsed().valid}
            fallback={
              <Field
                label={props.t(props.item ? "boc.controls.editor.definitionContent" : "boc.controls.editor.content")}
              >
                <textarea
                  class="controls-editor-code"
                  dir="ltr"
                  spellcheck={false}
                  value={props.item ? view.code : view.content}
                  disabled={view.saving}
                  onInput={(event) => updateCode(event.currentTarget.value)}
                />
              </Field>
            }
          >
            <Show when={!props.add && !props.item}>
              <Field label={props.t("boc.controls.editor.defaultAgent")}>
                <Choice
                  label={props.t("boc.controls.editor.defaultAgent")}
                  value={text(["default_agent"])}
                  disabled={view.saving}
                  options={[
                    { value: "", label: props.t("boc.controls.editor.inherit") },
                    ...props.agents
                      .filter((agent) => agent.agentMode !== "subagent" && agent.effective === "enabled")
                      .map((agent) => ({ value: agent.id, label: agent.name })),
                  ]}
                  onChange={(id) => update(["default_agent"], id || undefined)}
                />
              </Field>
            </Show>
            <Show when={!props.item}>
              <Field label={props.t("boc.controls.editor.kind")}>
                <Choice
                  label={props.t("boc.controls.editor.kind")}
                  value={view.category}
                  disabled={view.saving}
                  inline
                  options={(["agent", "mcp", "skill", "tool", "instruction"] as const).map((kind) => ({
                    value: kind,
                    label: props.t(`boc.bergflow.${kind}`),
                  }))}
                  onChange={(category) => setView({ category: category as Category, id: "", name: "" })}
                />
              </Field>
            </Show>
            <Show when={view.category === "agent" || view.category === "mcp"}>
              <Show when={!props.item && !props.add && ids().length}>
                <Field label={props.t("boc.controls.editor.definition")}>
                  <Choice
                    label={props.t("boc.controls.editor.definition")}
                    value={view.id}
                    disabled={view.saving}
                    options={ids().map((id) => ({ value: id, label: id }))}
                    onChange={(id) => setView("id", id)}
                  />
                </Field>
              </Show>
              <Show when={!props.item}>
                <div class="controls-editor-create">
                  <Field label={props.t("boc.controls.editor.name")}>
                    <input
                      value={view.name}
                      placeholder={props.t("boc.controls.editor.nameHint")}
                      disabled={view.saving}
                      onInput={(event) => setView("name", event.currentTarget.value)}
                    />
                  </Field>
                  <Button
                    variant="outline"
                    disabled={view.saving || !view.name.trim() || definitionExists(view.name.trim())}
                    onClick={() => {
                      const id = view.name.trim()
                      update(
                        [...root(), id],
                        view.category === "agent"
                          ? { description: "", mode: "subagent" }
                          : { type: "remote", url: "https://", disabled: true },
                      )
                      setView({ id, name: "" })
                    }}
                  >
                    {props.t("boc.controls.editor.create")}
                  </Button>
                </div>
                <Show when={view.name.trim() && definitionExists(view.name.trim())}>
                  <p class="controls-editor-hint">{props.t("boc.controls.editor.alreadyAvailable")}</p>
                </Show>
              </Show>
              <Show when={view.id}>
                <Field label={props.t("boc.controls.editor.activation")}>
                  <Choice
                    label={props.t("boc.controls.editor.activation")}
                    value={
                      !node([...definition(), "disabled"])
                        ? "inherit"
                        : value([...definition(), "disabled"]) === true
                          ? "disabled"
                          : "enabled"
                    }
                    disabled={view.saving}
                    options={(["inherit", "enabled", "disabled"] as const).map((state) => ({
                      value: state,
                      label: props.t(`boc.controls.editor.${state}`),
                    }))}
                    onChange={(state) =>
                      update([...definition(), "disabled"], state === "inherit" ? undefined : state === "disabled")
                    }
                  />
                </Field>
                <Show when={view.category === "agent"}>
                  <Field label={props.t("boc.controls.editor.description")}>
                    <input
                      value={text([...definition(), "description"])}
                      disabled={view.saving}
                      onInput={(event) =>
                        update([...definition(), "description"], event.currentTarget.value || undefined)
                      }
                    />
                  </Field>
                  <Field label={props.t("boc.controls.editor.model")}>
                    <ModelPicker
                      host={props.host}
                      selection={props.selection}
                      scope={view.scope}
                      value={model()}
                      inherited={props.agents.find((agent) => agent.id === view.id)?.model}
                      disabled={view.saving}
                      t={props.t}
                      onChange={(model) => update([...definition(), "model"], model || undefined)}
                    />
                  </Field>
                  <Field label={props.t("boc.controls.editor.mode")}>
                    <Choice
                      label={props.t("boc.controls.editor.mode")}
                      value={text([...definition(), "mode"])}
                      disabled={view.saving}
                      inline
                      options={[
                        { value: "", label: props.t("boc.controls.editor.inherit") },
                        ...(["primary", "subagent", "all"] as const).map((mode) => ({
                          value: mode,
                          label: props.t(`boc.controls.editor.${mode}`),
                        })),
                      ]}
                      onChange={(mode) => update([...definition(), "mode"], mode || undefined)}
                    />
                  </Field>
                  <Field label={props.t("boc.controls.editor.system")}>
                    <textarea
                      value={text([...definition(), "system"])}
                      disabled={view.saving}
                      onInput={(event) => update([...definition(), "system"], event.currentTarget.value || undefined)}
                    />
                  </Field>
                  <Show when={text([...definition(), "mode"]) !== "subagent"}>
                    <Button
                      variant="outline"
                      disabled={
                        view.saving ||
                        value([...definition(), "disabled"]) === true ||
                        text(["default_agent"]) === view.id
                      }
                      onClick={() => update(["default_agent"], view.id)}
                    >
                      {props.t("boc.controls.editor.makeDefault")}
                    </Button>
                  </Show>
                </Show>
                <Show when={view.category === "mcp"}>
                  <Field label={props.t("boc.controls.editor.transport")}>
                    <Choice
                      label={props.t("boc.controls.editor.transport")}
                      value={text([...definition(), "type"]) || "remote"}
                      disabled={view.saving}
                      options={(["remote", "local"] as const).map((type) => ({
                        value: type,
                        label: props.t(`boc.controls.editor.${type}`),
                      }))}
                      onChange={(type) => {
                        update([...definition(), "type"], type)
                        ;(type === "local" ? ["url", "headers", "oauth"] : ["command", "env"]).forEach((key) =>
                          update([...definition(), key], undefined),
                        )
                      }}
                    />
                  </Field>
                  <Show
                    when={text([...definition(), "type"]) === "local"}
                    fallback={
                      <Field label={props.t("boc.controls.editor.url")}>
                        <input
                          dir="ltr"
                          value={text([...definition(), "url"])}
                          disabled={view.saving}
                          onInput={(event) => {
                            update([...definition(), "type"], "remote")
                            update([...definition(), "url"], event.currentTarget.value)
                          }}
                        />
                      </Field>
                    }
                  >
                    <Field label={props.t("boc.controls.editor.command")}>
                      <textarea
                        dir="ltr"
                        value={lines([...definition(), "command"])}
                        placeholder={props.t("boc.controls.editor.commandHint")}
                        disabled={view.saving}
                        onChange={(event) => updateLines([...definition(), "command"], event.currentTarget.value)}
                      />
                    </Field>
                  </Show>
                </Show>
                <Show when={definitions().includes(view.id)}>
                  <Button
                    variant="ghost"
                    disabled={view.saving}
                    onClick={() => {
                      if (text(["default_agent"]) === view.id && view.category === "agent")
                        update(["default_agent"], undefined)
                      update(definition(), undefined)
                      setView("id", "")
                    }}
                  >
                    {props.t("boc.controls.editor.remove")}
                  </Button>
                </Show>
              </Show>
            </Show>
            <Show when={view.category === "skill"}>
              <Show when={props.createSource}>
                <Button
                  variant="outline"
                  disabled={view.saving || dirty()}
                  onClick={() => props.createSource?.("skill", view.scope)}
                >
                  {props.t("boc.controls.editor.createSkill")}
                </Button>
              </Show>
              <Show
                when={!node(["skills"]) || node(["skills"])?.type === "array"}
                fallback={
                  <Button variant="outline" onClick={() => setView("advanced", true)}>
                    {props.t("boc.controls.editor.advanced")}
                  </Button>
                }
              >
                <Field label={props.t("boc.controls.editor.sources")}>
                  <textarea
                    dir="ltr"
                    value={lines(["skills"])}
                    disabled={view.saving}
                    onChange={(event) => updateLines(["skills"], event.currentTarget.value)}
                  />
                </Field>
              </Show>
              <p class="controls-editor-hint">{props.t("boc.controls.editor.sourcesHint")}</p>
            </Show>
            <Show when={view.category === "instruction"}>
              <p class="controls-editor-hint">{props.t("boc.controls.editor.instructionsHint")}</p>
              <Show
                when={existingInstruction()}
                keyed
                fallback={
                  <Show when={props.createSource}>
                    <Button
                      variant="outline"
                      disabled={view.saving || dirty() || view.document?.instructionExists}
                      onClick={() => props.createSource?.("instruction", view.scope)}
                    >
                      {props.t("boc.controls.editor.createInstructions")}
                    </Button>
                    <Show when={view.document?.instructionExists}>
                      <p class="controls-editor-hint">{props.t("boc.controls.editor.instructionExists")}</p>
                    </Show>
                  </Show>
                }
              >
                {(item) => (
                  <Button variant="outline" disabled={view.saving || dirty()} onClick={() => props.editSource(item)}>
                    {props.t("boc.controls.editor.editInstructions")}
                  </Button>
                )}
              </Show>
            </Show>
            <Show when={view.category === "tool"}>
              <p class="controls-editor-hint">{props.t("boc.controls.editor.pluginsHint")}</p>
              <For each={node(["plugins"])?.children ?? []}>
                {(plugin, index) => (
                  <div class="controls-editor-create">
                    <code dir="ltr">
                      {plugin.type === "string" ? String(plugin.value) : text(["plugins", index(), "package"])}
                    </code>
                    <Button
                      variant="ghost"
                      disabled={view.saving}
                      onClick={() => update(["plugins", index()], undefined)}
                    >
                      {props.t("boc.controls.editor.remove")}
                    </Button>
                  </div>
                )}
              </For>
              <div class="controls-editor-create">
                <Field label={props.t("boc.controls.editor.plugin")}>
                  <input
                    dir="ltr"
                    value={view.name}
                    disabled={view.saving}
                    onInput={(event) => setView("name", event.currentTarget.value)}
                  />
                </Field>
                <Button
                  variant="outline"
                  disabled={view.saving || !view.name.trim()}
                  onClick={() => {
                    update(["plugins", -1], view.name.trim())
                    setView("name", "")
                  }}
                >
                  {props.t("boc.controls.add")}
                </Button>
              </div>
              <Button variant="outline" onClick={() => setView("advanced", true)}>
                {props.t("boc.controls.editor.advanced")}
              </Button>
            </Show>
          </Show>
          <details class="controls-editor-storage">
            <summary>{props.t("boc.controls.editor.storage")}</summary>
            <p class="controls-editor-path">
              <bdi dir="ltr">{view.document?.path}</bdi>
            </p>
            <p>{props.t("boc.controls.editor.inheritHint")}</p>
            <p>{props.t("boc.controls.editor.nativeHint")}</p>
          </details>
        </Show>
      </div>
      <footer>
        <div role="status" aria-live="polite">
          <Show when={view.error}>
            <p class="controls-editor-error">{props.t(`boc.controls.editor.${view.error || "error"}`)}</p>
          </Show>
          <Show when={view.document && (!parsed().valid || view.invalidCode)}>
            <p class="controls-editor-error">{props.t("boc.controls.editor.invalid")}</p>
          </Show>
          <Show when={view.saved}>
            <p>{props.t("boc.controls.editor.saved")}</p>
          </Show>
          <Show when={view.closing && dirty()}>
            <p>{props.t("boc.controls.editor.unsaved")}</p>
          </Show>
        </div>
        <div class="controls-editor-buttons">
          <Show when={view.closing && dirty()}>
            <Button variant="outline" disabled={view.saving} onClick={props.close}>
              {props.t("boc.controls.editor.discard")}
            </Button>
          </Show>
          <Button
            disabled={!dirty() || !parsed().valid || view.invalidCode || view.saving || view.loading}
            onClick={() => void save()}
          >
            {props.t(view.saving ? "boc.controls.editor.saving" : "boc.controls.editor.save")}
          </Button>
        </div>
      </footer>
    </EditorPanel>
  )
}

function Field(props: { label: string; children: JSX.Element }) {
  return (
    <label class="controls-editor-field">
      <span>{props.label}</span>
      {props.children}
    </label>
  )
}
