import { describe, expect, test } from "bun:test"
import { createBocTranslator } from "../../../renderer/i18n"
import { TOKEN_FIXTURE } from "../fixtures/http"
import { jiraBoardMessage, jiraBoardSurface } from "./surface"

const t = createBocTranslator(() => "en")
const connected = {
  status: "connected" as const,
  encryptionAvailable: true as const,
  site: "acme",
  email: "mia@example.com",
  displayName: "Mia Krystof",
}

describe("jiraBoardSurface", () => {
  test("prefers offline, configuration, and failure states over the board", () => {
    expect(jiraBoardSurface({ online: false, loading: false, boards: [], issues: [], filtered: [] })).toBe("offline")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: { status: "not-configured", encryptionAvailable: true },
        boards: [],
        issues: [],
        filtered: [],
      }),
    ).toBe("not-configured")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        failure: { ok: false, category: "rate-limit", retryAfterSeconds: 8 },
        boards: [{ id: 1 }],
        issues: [],
        filtered: [],
      }),
    ).toBe("rate-limit")
  })

  test("distinguishes empty boards, empty issues, and filter misses", () => {
    const board = {
      id: 84,
      name: "scrum board",
      type: "scrum" as const,
      filterId: "1001",
      columns: [],
      sprints: [{ id: 37, name: "Sprint 1", state: "active" }],
    }
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [],
        issues: [],
        filtered: [],
      }),
    ).toBe("no-boards")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        issues: [],
        filtered: [],
      }),
    ).toBe("needs-default")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board: { ...board, sprints: [] },
        issues: [],
        filtered: [],
      }),
    ).toBe("no-sprints")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board,
        issues: [],
        filtered: [],
      }),
    ).toBe("empty")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board,
        issues: [{ id: "1", key: "PLAT-1", summary: "A", labels: [], url: "https://acme.atlassian.net/browse/PLAT-1" }],
        filtered: [],
      }),
    ).toBe("board")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board,
        issues: [{ id: "1", key: "PLAT-1", summary: "A", labels: [], url: "https://acme.atlassian.net/browse/PLAT-1" }],
        filtered: [],
        hasIssueFilters: true,
      }),
    ).toBe("no-matches")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board,
        issues: [{ id: "1", key: "PLAT-1", summary: "A", labels: [], url: "https://acme.atlassian.net/browse/PLAT-1" }],
        filtered: [{ id: "1", key: "PLAT-1", summary: "A", labels: [], url: "https://acme.atlassian.net/browse/PLAT-1" }],
      }),
    ).toBe("board")
    expect(
      jiraBoardSurface({
        online: true,
        loading: false,
        connection: connected,
        boards: [{ id: 84 }],
        board: { ...board, sprints: [] },
        issues: [],
        filtered: [],
        searching: true,
      }),
    ).toBe("board")
  })
})

describe("jiraBoardMessage", () => {
  test("maps each board surface to dictionary copy without a token", () => {
    expect(jiraBoardMessage(t, "offline")).toBe("You are offline. Reconnect to load the Jira board.")
    expect(jiraBoardMessage(t, "needs-default")).toBe("Choose a default board to open this Jira site.")
    expect(jiraBoardMessage(t, "empty")).toBe("No issues in this view.")
    expect(jiraBoardMessage(t, "rate-limit", { ok: false, category: "rate-limit", retryAfterSeconds: 8 })).toBe(
      "Jira rate-limited the request. Try again in 8 seconds.",
    )
    expect(jiraBoardMessage(t, "error", { ok: false, category: "permission" })).toBe(
      "The account does not have permission to access this Jira site.",
    )
    expect(jiraBoardMessage(t, "error", { ok: false, category: "auth" })).not.toContain(TOKEN_FIXTURE)
  })
})
