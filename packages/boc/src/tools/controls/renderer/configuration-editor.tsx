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
  category?: Category
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
    category: props.category ?? (props.item?.kind === "mcp" ? "mcp" : props.item?.kind === "skill" ? "skill" : "agent"),
    id: props.item?.id ?? "",
    name: "",
    loading: true,
    saving: false,
    advanced: !props.item && !props.add,
    code: "",
    invalidCode: false,
    error: "" as "" | "error" | "conflict" | "invalid",
    saved: false,
    closing: false,
    removing: false,
    created: false,
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
    return server && path.length === 4 && !node(path.slice(0, 3)) ? server[path[3] as keyof typeof server] : undefined
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
  const definition = () => [...root(), view.id.trim()]
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
    if (view.advanced) return
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
      setView({ content, saved: false, error: "", removing: false })
      return
    }
    const errors: ParseError[] = []
    const tree = parseTree(content, errors, { allowTrailingComma: true })
    setView({
      code: content,
      invalidCode: !tree || tree.type !== "object" || errors.length > 0,
      saved: false,
      removing: false,
    })
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
  const addExists = () =>
    props.add &&
    !view.created &&
    !!view.name.trim() &&
    (view.category === "agent"
      ? props.agents.some((agent) => agent.id === view.name.trim()) ||
        !!findNodeAtLocation(parseTree(view.document?.content ?? "{}")!, ["agents", view.name.trim()])
      : view.category === "mcp" &&
        (view.document?.mcp?.[view.name.trim()] !== undefined ||
          !!findNodeAtLocation(parseTree(view.document?.content ?? "{}")!, ["mcp", "servers", view.name.trim()])))
  const missingConnection = () => {
    if (view.advanced || view.category !== "mcp" || !view.id || !parsed().valid) return
    if (text([...definition(), "type"]) === "local")
      return lines([...definition(), "command"]).trim() ? undefined : ("commandRequired" as const)
    return text([...definition(), "url"]).trim() ? undefined : ("urlRequired" as const)
  }
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
      removing: false,
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
    if (
      !connection ||
      !view.document ||
      view.saving ||
      !parsed().valid ||
      view.invalidCode ||
      missingConnection() ||
      addExists()
    )
      return
    if (identity !== connection.identity()) {
      setView("error", "error")
      return
    }
    setView({ saving: true, error: "" })
    try {
      const content = view.content
      const document = await connection
        .client()
        .saveConfiguration({ scope: view.scope, content, expectedRevision: view.document.revision }, options())
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) {
        setView("error", "error")
        return
      }
      setView({ document, content: document.content, saved: true, created: props.add, closing: false })
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
  const removeDefinition = async () => {
    if (!connection || !view.document || view.saving || !["agent", "mcp"].includes(view.category)) return
    if (identity !== connection.identity()) {
      setView("error", "error")
      return
    }
    setView({ saving: true, error: "" })
    try {
      const withoutDefinition = applyEdits(
        view.content,
        modify(view.content, definition(), undefined, { formattingOptions: { insertSpaces: true, tabSize: 2 } }),
      )
      const content =
        view.category === "agent" && text(["default_agent"]) === view.id
          ? applyEdits(withoutDefinition, modify(withoutDefinition, ["default_agent"], undefined, {}))
          : withoutDefinition
      await connection
        .client()
        .saveConfiguration({ scope: view.scope, content, expectedRevision: view.document.revision }, options())
      if (abort.signal.aborted) return
      if (identity !== connection.identity()) throw new Error("boc.controls.connection_changed")
      props.saved()
      props.close()
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
      setView({ closing: true, removing: false })
      return
    }
    props.close()
  }
  const title = () => {
    if (props.item) return props.t("boc.controls.editor.editTitle", { name: props.item.name })
    if (props.add) return props.t(`boc.controls.add.${view.category}`)
    return props.t(view.scope === "global" ? "boc.controls.editor.globalTitle" : "boc.controls.editor.projectTitle")
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
          <DialogTitle>{title()}</DialogTitle>
          <Show when={!props.add}>
            <p>
              {props.t(
                view.scope === "global" ? "boc.controls.editor.globalSummary" : "boc.controls.editor.projectSummary",
              )}
            </p>
          </Show>
          <Show when={view.document} keyed>
            {(document) => (
              <p class="controls-editor-path">
                {props.t("boc.controls.editor.path")}: <bdi dir="ltr">{document.path}</bdi>
              </p>
            )}
          </Show>
        </div>
        <Button variant="ghost" size="small" disabled={view.saving} onClick={close}>
          {props.t("boc.controls.editor.cancel")}
        </Button>
      </header>
      <div class="controls-editor-body">
        <Show when={view.loading}>
          <p role="status">{props.t("boc.controls.editor.loading")}</p>
        </Show>
        <Show when={!view.loading && !view.document && view.error}>
          <Button variant="outline" onClick={() => void load(view.scope)}>
            {props.t("boc.controls.editor.retryLoad")}
          </Button>
        </Show>
        <Show when={view.document && !view.loading}>
          <Show
            when={
              props.item && view.scope === "project" && props.item.origin !== "project" && props.item.kind === "agent"
            }
          >
            <p class="controls-editor-hint">{props.t("boc.controls.editor.overrideHint")}</p>
          </Show>
          <Show when={!props.add}>
            <div class="controls-editor-tabs" role="group" aria-label={title()}>
              <Button
                variant={view.advanced ? "ghost" : "outline"}
                size="small"
                onClick={() => setView("advanced", false)}
                disabled={view.invalidCode}
                aria-pressed={!view.advanced}
              >
                {props.t(props.item ? "boc.controls.editor.form" : "boc.controls.editor.commonSettings")}
              </Button>
              <Button
                variant={view.advanced ? "outline" : "ghost"}
                size="small"
                onClick={openCode}
                aria-pressed={view.advanced}
              >
                {props.t("boc.controls.editor.advanced")}
              </Button>
            </div>
          </Show>
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
              <Field group label={props.t("boc.controls.editor.defaultAgent")}>
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
            <Show when={!props.item && !props.category}>
              <Field group label={props.t("boc.controls.editor.kind")}>
                <Choice
                  label={props.t("boc.controls.editor.kind")}
                  value={view.category}
                  disabled={view.saving}
                  inline
                  options={(["agent", "mcp", "skill", "tool", "instruction"] as const).map((kind) => ({
                    value: kind,
                    label: props.t(`boc.bergflow.${kind}`),
                  }))}
                  onChange={(category) =>
                    setView({ category: category as Category, id: "", name: "", removing: false })
                  }
                />
              </Field>
            </Show>
            <Show when={view.category === "agent" || view.category === "mcp"}>
              <Show when={!props.item && !props.add && ids().length}>
                <Field group label={props.t("boc.controls.editor.definition")}>
                  <Choice
                    label={props.t("boc.controls.editor.definition")}
                    value={view.id}
                    disabled={view.saving}
                    options={ids().map((id) => ({ value: id, label: id }))}
                    onChange={(id) => setView({ id, removing: false })}
                  />
                </Field>
              </Show>
              <Show when={!props.item}>
                <div class="controls-editor-create">
                  <Field label={props.t("boc.controls.editor.name")}>
                    <input
                      value={view.name}
                      placeholder={props.t("boc.controls.editor.nameHint")}
                      disabled={view.saving || (props.add && view.created)}
                      onInput={(event) => {
                        if (props.add) {
                          const name = event.currentTarget.value
                          setView({ name, saved: false })
                          if (!name.trim() || addExists()) return
                          const draft = value(definition())
                          if (view.id && view.id !== name.trim()) update(definition(), undefined)
                          setView("id", name.trim())
                          update(
                            definition(),
                            draft ??
                              (view.category === "agent"
                                ? { description: "", mode: "subagent" }
                                : { type: "remote", disabled: true }),
                          )
                          return
                        }
                        setView("name", event.currentTarget.value)
                      }}
                    />
                  </Field>
                  <Show when={!props.add}>
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
                  </Show>
                </div>
                <Show
                  when={
                    (props.add && addExists()) || (!props.add && view.name.trim() && definitionExists(view.name.trim()))
                  }
                >
                  <p class="controls-editor-hint">{props.t("boc.controls.editor.alreadyAvailable")}</p>
                </Show>
              </Show>
              <Show when={view.id && (!props.add || (!!view.name.trim() && !addExists()))}>
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
                  <Field group label={props.t("boc.controls.editor.model")}>
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
                  <Field label={props.t("boc.controls.editor.system")}>
                    <textarea
                      value={text([...definition(), "system"])}
                      disabled={view.saving}
                      onInput={(event) => update([...definition(), "system"], event.currentTarget.value || undefined)}
                    />
                  </Field>
                </Show>
                <Show when={view.category === "mcp"}>
                  <Field group label={props.t("boc.controls.editor.transport")}>
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
                        ;(type === "local" ? ["url", "headers", "oauth"] : ["command", "environment", "cwd"]).forEach(
                          (key) => update([...definition(), key], undefined),
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
                <details class="controls-editor-options" open={view.category === "mcp"}>
                  <summary>{props.t("boc.controls.editor.moreOptions")}</summary>
                  <Field group label={props.t("boc.controls.editor.activation")}>
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
                    <Field group label={props.t("boc.controls.editor.mode")}>
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
                </details>
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
              <Show when={!props.add}>
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
              </Show>
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
              <Show when={!props.add}>
                <Button variant="outline" onClick={() => setView("advanced", true)}>
                  {props.t("boc.controls.editor.advanced")}
                </Button>
              </Show>
            </Show>
          </Show>
          <Show when={!props.add}>
            <details class="controls-editor-storage">
              <summary>{props.t("boc.controls.editor.storage")}</summary>
              <p class="controls-editor-path">
                <bdi dir="ltr">{view.document?.path}</bdi>
              </p>
              <p>{props.t("boc.controls.editor.inheritHint")}</p>
              <p>{props.t("boc.controls.editor.nativeHint")}</p>
            </details>
          </Show>
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
          <Show when={missingConnection()}>
            {(message) => <p class="controls-editor-hint">{props.t(`boc.controls.editor.${message()}`)}</p>}
          </Show>
          <Show when={view.saved}>
            <p class="controls-editor-success">{props.t("boc.controls.editor.saved")}</p>
          </Show>
          <Show when={view.removing}>
            <p class="controls-editor-danger">
              {props.t(
                view.category === "agent" ? "boc.controls.editor.removeAgentHint" : "boc.controls.editor.removeMcpHint",
                { name: props.item?.name ?? view.id },
              )}
            </p>
          </Show>
          <Show when={view.closing && dirty()}>
            <p>{props.t("boc.controls.editor.unsaved")}</p>
          </Show>
        </div>
        <div class="controls-editor-buttons">
          <Show
            when={
              !props.add && ["agent", "mcp"].includes(view.category) && definitions().includes(view.id) && !view.closing
            }
          >
            <Button
              variant={view.removing ? "danger" : "ghost"}
              disabled={view.saving || dirty()}
              onClick={() => {
                if (view.removing) {
                  void removeDefinition()
                  return
                }
                setView({ removing: true, saved: false })
              }}
            >
              {props.t(
                view.category === "agent"
                  ? view.removing
                    ? "boc.controls.editor.confirmRemoveAgent"
                    : "boc.controls.editor.removeAgent"
                  : view.removing
                    ? "boc.controls.editor.confirmRemoveMcp"
                    : "boc.controls.editor.removeMcp",
              )}
            </Button>
            <Show when={view.removing}>
              <Button variant="outline" disabled={view.saving} onClick={() => setView("removing", false)}>
                {props.t(view.category === "agent" ? "boc.controls.editor.keepAgent" : "boc.controls.editor.keepMcp")}
              </Button>
            </Show>
          </Show>
          <Show when={view.closing && dirty()}>
            <Button
              variant="outline"
              disabled={view.saving}
              onClick={(event: MouseEvent & { currentTarget: HTMLButtonElement }) => {
                const field = event.currentTarget
                  .closest('[role="dialog"]')
                  ?.querySelector<HTMLElement>(
                    ".controls-editor-body textarea:not(:disabled), .controls-editor-body input:not(:disabled)",
                  )
                setView("closing", false)
                field?.focus()
              }}
            >
              {props.t("boc.controls.editor.keepEditing")}
            </Button>
            <Button variant="ghost" disabled={view.saving} onClick={props.close}>
              {props.t("boc.controls.editor.discard")}
            </Button>
          </Show>
          <Button
            disabled={
              !dirty() ||
              !parsed().valid ||
              view.invalidCode ||
              view.saving ||
              view.loading ||
              addExists() ||
              !!missingConnection() ||
              (props.add && ["agent", "mcp"].includes(view.category) && !view.name.trim())
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

function Field(props: { label: string; group?: boolean; children: JSX.Element }) {
  return (
    <Show
      when={props.group}
      fallback={
        <label class="controls-editor-field">
          <span>{props.label}</span>
          {props.children}
        </label>
      }
    >
      <div class="controls-editor-field">
        <span>{props.label}</span>
        {props.children}
      </div>
    </Show>
  )
}
