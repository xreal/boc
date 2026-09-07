import { expect, test } from "bun:test"
import { controlOrigin } from "./origin"

const directories = { project: ["/workspace/shop", "/workspace/shop-review"], global: ["/config/opencode"] }

test("distinguishes bundled skills, global configuration and project worktrees", () => {
  expect(controlOrigin("/builtin/opencode.md", directories)).toBe("system")
  expect(controlOrigin("/config/opencode/skills/review/SKILL.md", directories)).toBe("global")
  expect(controlOrigin("/workspace/shop-review/AGENTS.md", directories)).toBe("project")
  expect(controlOrigin("C:\\project\\.opencode\\skills\\review.md", { project: ["C:\\project"], global: [] })).toBe(
    "project",
  )
})

test("does not confuse adjacent paths or registry labels with provenance", () => {
  expect(controlOrigin("/workspace/shop-other/AGENTS.md", directories)).toBe("unknown")
  expect(controlOrigin("/builtin-other/review.md", directories)).toBe("unknown")
  expect(controlOrigin("OpenCode tool registry", directories)).toBe("unknown")
  expect(controlOrigin("OpenCode MCP configuration", directories)).toBe("unknown")
})
