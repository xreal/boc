import type { ControlState, ControlsHost } from "@boc/extensions/controls"
import { BocScreen, BocHostProvider } from "@boc/extensions/renderer"

function ControlsPreview() {
  let snapshot: ControlState = {
    info: {
      protocol: 1,
      version: "1",
      project: { id: "fixture", canonical: "/workspace/shop" },
      location: { directory: "/workspace/shop" },
      source: "bundled",
      scope: "project-on-server",
      categories: ["agent", "skill", "tool", "mcp", "instruction"],
      operations: ["info", "getState", "setEnabled", "clearOverride", "retryApply"],
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
        id: "build",
        name: "Build",
        source: "opencode.agent",
        origin: "system",
        effect: "read_only",
        mutable: false,
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
    setEnabled: async (input: { id: string; enabled: boolean }) => {
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
  }
  const identity = {}
  const controls = {
    initial: async () => ({ server: "fixture", project: "/workspace/shop", directory: "/workspace/shop" }),
    remember: () => {},
    openSession: async () => {},
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

export default {
  title: "Boc/Project Controls",
  id: "boc-controls",
  component: ControlsPreview,
  parameters: { layout: "fullscreen" },
}
export const Default = {}
export const Dark = { globals: { theme: "dark" } }
export const Rtl = { globals: { direction: "rtl" } }
