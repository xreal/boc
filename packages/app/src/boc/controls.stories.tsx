import type { ControlState, ControlsHost } from "@boc/extensions/controls"
import { BocScreen, BocHostProvider } from "@boc/extensions/renderer"

function ControlsPreview() {
  const documents: Record<"project" | "global", FixtureDocument> = {
    project: {
      scope: "project" as const,
      path: "/workspace/shop/opencode.json",
      content: `{
  "agents": {
    "reviewer": {
      "description": "Reviews changes",
      "mode": "subagent",
      "disabled": false
    },
    "planner": {
      "description": "Plans implementation work",
      "mode": "subagent"
    },
    "writer": {
      "description": "Writes documentation",
      "mode": "subagent"
    },
    "tester": {
      "description": "Runs focused tests",
      "mode": "subagent"
    }
  },
}`,
      revision: 1,
      instructionExists: true,
      mcp: {
        documentation: {
          type: "remote",
          url: "https://docs.example.com/mcp",
          headers: { "X-Api-Key": "fixture-key" },
          oauth: { client_id: "fixture-client", scope: "docs.read" },
        },
      },
    },
    global: {
      scope: "global" as const,
      path: "/config/opencode/opencode.json",
      content: "{}\n",
      revision: 1,
      instructionExists: false,
    },
  }
  const sources: Record<string, FixtureSource> = {
    "skill:review": {
      kind: "skill",
      scope: "project",
      id: "review",
      path: "/workspace/shop/.opencode/skills/review/SKILL.md",
      content: "---\nname: review\ndescription: Review changes\n---\n\nReview the current diff.\n",
      revision: 1,
    },
    "instruction:AGENTS.md": {
      kind: "instruction",
      scope: "project",
      id: "AGENTS.md",
      path: "/workspace/shop/AGENTS.md",
      content: "# Project instructions\n\nRun focused tests.\n",
      revision: 1,
    },
  }
  let snapshot: ControlState = {
    info: {
      protocol: 1,
      version: "1",
      project: { id: "fixture", canonical: "/workspace/shop" },
      location: { directory: "/workspace/shop" },
      source: "bundled",
      scope: "project-on-server",
      categories: ["agent", "skill", "tool", "mcp", "instruction"],
      operations: ["info", "getState", "getConfiguration", "saveConfiguration", "getSource", "saveSource", "createSource", "deleteSource", "setEnabled", "clearOverride", "retryApply"],
    },
    revision: 0,
    incomplete: [],
    items: [
      {
        kind: "skill",
        id: "opencode",
        name: "OpenCode guide",
        source: "/builtin/opencode.md",
        effect: "next_skill_request",
        mutable: true,
      },
      {
        kind: "skill",
        id: "global-review",
        name: "Global review",
        source: "/config/opencode/skills/review/SKILL.md",
        effect: "next_skill_request",
        mutable: true,
      },
      {
        kind: "skill",
        id: "review",
        name: "Review changes",
        source: "/workspace/shop/.opencode/skills/review/SKILL.md",
        effect: "next_skill_request",
        mutable: true,
      },
      {
        kind: "agent",
        id: "reviewer",
        name: "Reviewer",
        description: "Reviews changes before they are merged.",
        source: "/workspace/shop/opencode.json",
        origin: "project",
        effect: "next_model_request",
        mutable: true,
      },
      {
        kind: "agent",
        id: "general",
        name: "General",
        source: "opencode.agent",
        origin: "system",
        effect: "read_only",
        mutable: false,
      },
      {
        kind: "instruction",
        id: "AGENTS.md",
        name: "AGENTS.md",
        source: "/workspace/shop/AGENTS.md",
        effect: "next_instruction_request",
        mutable: true,
      },
      {
        kind: "mcp",
        id: "documentation",
        name: "Documentation",
        source: "/workspace/shop/opencode.json",
        effect: "mcp_reconnect",
        mutable: true,
      },
    ].map((item) => ({
      description: "",
      override: null,
      defaultEnabled: true,
      effective: "enabled",
      application: "applied",
      present: true,
      availability: "available",
      ...item,
    })) as ControlState["items"],
  }
  const client = {
    info: async () => snapshot.info,
    getState: async () => structuredClone(snapshot),
    setEnabled: async (input: { id: string; enabled: boolean; expectedRevision: number }) => {
      if (input.expectedRevision !== snapshot.revision) throw { type: "conflict", revision: snapshot.revision }
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        items: snapshot.items.map((item) =>
          item.id === input.id
            ? { ...item, override: input.enabled, effective: input.enabled ? "enabled" : "disabled" }
            : item,
        ),
      }
      return structuredClone(snapshot)
    },
    getConfiguration: async (input: { scope: "project" | "global" }) => document(documents[input.scope]),
    saveConfiguration: async (input: {
      scope: "project" | "global"
      content: string
      expectedRevision: string
    }) => {
      const current = documents[input.scope]
      if (input.expectedRevision !== revision(current)) throw { type: "conflict" }
      if (input.content.includes("fixture-conflict")) throw { type: "conflict" }
      documents[input.scope] = { ...current, content: input.content, revision: current.revision + 1 }
      return document(documents[input.scope])
    },
    getSource: async (input: { kind: "skill" | "instruction"; id: string }) => {
      const source = sources[`${input.kind}:${input.id}`]
      if (!source) throw { type: "not_supported" }
      return sourceDocument(source)
    },
    saveSource: async (input: { kind: "skill" | "instruction"; id: string; content: string; expectedRevision: string }) => {
      const key = `${input.kind}:${input.id}`
      const current = sources[key]
      if (!current || input.expectedRevision !== sourceRevision(current)) throw { type: "conflict" }
      sources[key] = { ...current, content: input.content, revision: current.revision + 1 }
      return sourceDocument(sources[key])
    },
    createSource: async (input: { kind: "skill" | "instruction"; scope: "project" | "global"; name: string; content: string }) => {
      const id = input.kind === "instruction" ? "AGENTS.md" : input.name
      const key = `${input.kind}:${id}`
      if (sources[key]) throw { type: "invalid_source" }
      const source = {
        kind: input.kind,
        scope: input.scope,
        id,
        path: input.kind === "skill" ? `/${input.scope}/skills/${id}/SKILL.md` : `/${input.scope}/AGENTS.md`,
        content: input.content,
        revision: 1,
      } satisfies FixtureSource
      sources[key] = source
      return sourceDocument(source)
    },
    deleteSource: async (input: { kind: "skill" | "instruction"; id: string; expectedRevision: string }) => {
      const key = `${input.kind}:${input.id}`
      const source = sources[key]
      if (!source || input.expectedRevision !== sourceRevision(source)) throw { type: "conflict" }
      delete sources[key]
      return {}
    },
  }
  const identity = {}
  const controls = {
    initial: async () => ({ server: "fixture", project: "/workspace/shop", directory: "/workspace/shop" }),
    remember: () => {},
    openSession: async () => {},
    models: async () => [
      { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
      { id: "anthropic/claude-sonnet-4-6#fast", name: "Claude Sonnet 4.6 Fast", provider: "Anthropic" },
      { id: "anthropic/claude-sonnet-4-6#thinking", name: "Claude Sonnet 4.6 Thinking", provider: "Anthropic" },
      { id: "openai/gpt-5.4", name: "GPT-5.4", provider: "OpenAI" },
      { id: "google/gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "Google" },
      ...Array.from({ length: 24 }, (_, index) => ({
        id: `fixture/model-${index + 1}`,
        name: `Fixture model ${index + 1}`,
        provider: "Fixture",
      })),
    ],
    servers: () => [
      {
        key: "fixture",
        name: "Development server",
        globalDirectories: ["/config/opencode"],
        projects: [
          { name: "Shop", directory: "/workspace/shop", locations: ["/workspace/shop", "/workspace/shop-review"] },
        ],
      },
    ],
    connect: () => ({
      client: () => client,
      identity: () => identity,
      status: () => "connected",
      attempt: () => 0,
      subscribe: () => () => {},
    }),
  } as unknown as ControlsHost
  return (
    <BocHostProvider
      value={{
        controls,
        platform: "web",
        locale: () => "en",
        navigate: () => {},
        location: () => ({ pathname: "/boc/controls", search: "" }),
        route: () => ({ type: "boc", id: "controls" }),
        openExternal: () => {},
      }}
    >
      <BocScreen id="controls" />
    </BocHostProvider>
  )
}

type FixtureDocument = {
  scope: "project" | "global"
  path: string
  content: string
  revision: number
  instructionExists?: boolean
  mcp?: Record<string, { type: "remote"; url: string; headers?: Record<string, string>; oauth?: { client_id: string; scope: string } }>
}
type FixtureSource = {
  kind: "skill" | "instruction"
  scope: "project" | "global"
  id: string
  path: string
  content: string
  revision: number
}

function revision(document: Pick<FixtureDocument, "scope" | "revision">) {
  return `${document.scope}-hash-${document.revision}`
}

function document(input: FixtureDocument) {
  return {
    scope: input.scope,
    path: input.path,
    content: input.content,
    revision: revision(input),
    mcp: input.mcp,
    instructionExists: input.instructionExists,
  }
}

function sourceRevision(source: Pick<FixtureSource, "kind" | "id" | "revision">) {
  return `${source.kind}-${source.id}-hash-${source.revision}`
}

function sourceDocument(source: FixtureSource) {
  return { ...source, revision: sourceRevision(source) }
}

export default {
  title: "Boc/Project Controls",
  id: "boc-controls",
  component: ControlsPreview,
  parameters: { layout: "fullscreen" },
}
export const Default = {}
export const Dark = { globals: { theme: "dark" } }
export const Rtl = { globals: { direction: "rtl" } }
