export * as BocControlSource from "./control-source.js"

import type { Context } from "@opencode-ai/plugin/effect/plugin"

const sources = new WeakMap<object, { file: string } | { plugin: string }>()
export const get = (value: object) => sources.get(value)

export function file(value: object | undefined, path: string | undefined) {
  if (value && path) sources.set(value, { file: path })
}

// Attribute newly registered definitions, never policy-only edits to existing
// definitions. Metadata follows the lifetime of the real registry objects.
export function remember(context: Context, plugin: string) {
  const attribute = (before: Set<object>, values: readonly object[]) =>
    values.forEach((value) => {
      if (!before.has(value) && !sources.has(value)) sources.set(value, { plugin })
    })
  const agent: Context["agent"] = {
    ...context.agent,
    transform: (callback) =>
      context.agent.transform((editor) => {
        const before = new Set(editor.list())
        callback(editor)
        attribute(before, editor.list())
      }),
  }
  const tool: Context["tool"] = {
    ...context.tool,
    transform: (callback) =>
      context.tool.transform((editor) => {
        const before = new Set(editor.list())
        callback(editor)
        attribute(before, editor.list())
      }),
  }
  const mcp: Context["mcp"] = {
    ...context.mcp,
    transform: (callback) =>
      context.mcp.transform((editor) => {
        const before = new Set(editor.list().map(([, value]) => value))
        callback(editor)
        attribute(
          before,
          editor.list().map(([, value]) => value),
        )
      }),
  }
  return { ...context, agent, tool, mcp }
}
