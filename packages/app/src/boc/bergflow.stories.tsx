import type { ControlState, BergflowHost } from "@boc/extensions/bergflow"
import { BocScreen, BocHostProvider } from "@boc/extensions/renderer"

function ControlsPreview() {
  let snapshot: ControlState = {
    info: {
      protocol: 1,
      version: "0.2.0",
      project: { id: "fixture", canonical: "/workspace/shop" },
      location: { directory: "/workspace/shop" },
      source: "bundled",
      scope: "project-on-server",
      categories: ["agent", "skill", "tool", "mcp", "instruction"],
      operations: ["info", "getState", "setEnabled", "clearOverride", "retryApply"],
    },
    revision: 0,
    incomplete: ["tool"],
    items: [
      {
        kind: "skill",
        id: "review",
        name: "Review changes",
        source: "/workspace/shop/.opencode/skills/review/SKILL.md",
        effect: "next_skill_request",
        mutable: true,
      },
      { kind: "agent", id: "build", name: "Build", source: "OpenCode", effect: "read_only", mutable: false },
      {
        kind: "mcp",
        id: "documentation",
        name: "Documentation",
        source: "OpenCode MCP configuration",
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
  } as unknown as BergflowHost
  return (
    <BocHostProvider
      value={{
        controls,
        platform: "web",
        locale: () => "en",
        navigate: () => {},
        location: () => ({ pathname: "/boc/bergflow", search: "" }),
        route: () => ({ type: "boc", id: "bergflow" }),
        openExternal: () => {},
      }}
    >
      <BocScreen id="bergflow" />
    </BocHostProvider>
  )
}

export default {
  title: "Boc/Bergflow Controls",
  id: "boc-bergflow",
  component: ControlsPreview,
  parameters: { layout: "fullscreen" },
}
export const Default = {}
export const Dark = { globals: { theme: "dark" } }
export const Rtl = { globals: { direction: "rtl" } }
