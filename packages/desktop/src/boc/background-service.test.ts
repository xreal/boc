import { describe, expect, test } from "bun:test"
import type { Endpoint } from "@opencode-ai/client/service"
import { connectBocService, inspectBocService, type BocServiceLifecycle } from "./background-service"

const official = endpoint("official")
const boc = endpoint("boc")
const isolated = endpoint("isolated")

describe("Boc background service", () => {
  test("keeps a compatible shared Boc service", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      inspections: { official: { version: "1.2.3", boc: true } },
    })

    expect(await connectBocService(lifecycle)).toBe(official)
    expect(events).toEqual(["discover", "inspect:official"])
  })

  test("replaces a compatible official service through handoff", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      sharedReplacement: boc,
      inspections: {
        official: { version: "1.2.3", boc: false },
        boc: { version: "1.2.3", boc: true },
      },
    })

    expect(await connectBocService(lifecycle)).toBe(boc)
    expect(events).toEqual([
      "discover",
      "inspect:official",
      "discover-isolated",
      "stop-shared",
      "ensure-shared",
      "inspect:boc",
    ])
  })

  test("leaves an incompatible official service running", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      inspections: {
        official: { version: "2.0.0", boc: false },
        isolated: { version: "1.2.3", boc: true },
      },
    })

    expect(await connectBocService(lifecycle)).toBe(isolated)
    expect(events).toEqual([
      "discover",
      "inspect:official",
      "discover-isolated",
      "ensure-isolated",
      "inspect:isolated",
    ])
  })

  test("reuses an existing isolated fallback", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      isolated,
      inspections: {
        official: { version: "2.0.0", boc: false },
        isolated: { version: "1.2.3", boc: true },
      },
    })

    expect(await connectBocService(lifecycle)).toBe(isolated)
    expect(events).toEqual([
      "discover",
      "inspect:official",
      "discover-isolated",
      "inspect:isolated",
    ])
  })

  test("updates an outdated isolated fallback without touching the shared service", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      isolated,
      inspections: {
        official: { version: "2.0.0", boc: false },
        isolated: { version: "1.0.0", boc: true },
        "isolated-current": { version: "1.2.3", boc: true },
      },
      isolatedReplacement: endpoint("isolated-current"),
    })

    expect(await connectBocService(lifecycle)).toEqual(endpoint("isolated-current"))
    expect(events).toEqual([
      "discover",
      "inspect:official",
      "discover-isolated",
      "inspect:isolated",
      "ensure-isolated",
      "inspect:isolated-current",
    ])
  })

  test("falls back when another contender wins the shared registration", async () => {
    const events: string[] = []
    const lifecycle = fixture(events, {
      shared: official,
      sharedReplacement: official,
      inspections: {
        official: { version: "1.2.3", boc: false },
        isolated: { version: "1.2.3", boc: true },
      },
    })

    expect(await connectBocService(lifecycle)).toBe(isolated)
    expect(events).toEqual([
      "discover",
      "inspect:official",
      "discover-isolated",
      "stop-shared",
      "ensure-shared",
      "inspect:official",
      "ensure-isolated",
      "inspect:isolated",
    ])
  })

  test("recognizes only an enabled Boc backend", async () => {
    const responses = [
      new Response(JSON.stringify({ healthy: true, version: "1.2.3", pid: 1 })),
      new Response(
        JSON.stringify({ available: false, backend: "boc/rift", reason: "project-mismatch", message: "missing" }),
      ),
    ]

    expect(await inspectBocService(official, "/project", undefined, async () => responseFrom(responses))).toEqual({
      version: "1.2.3",
      boc: true,
    })
  })
})

function fixture(
  events: string[],
  options: {
    readonly shared?: Endpoint
    readonly isolated?: Endpoint
    readonly sharedReplacement?: Endpoint
    readonly isolatedReplacement?: Endpoint
    readonly inspections: Record<string, { readonly version: string; readonly boc: boolean }>
  },
): BocServiceLifecycle {
  return {
    version: "1.2.3",
    mode: "initial",
    discoverShared: async () => {
      events.push("discover")
      return options.shared
    },
    discoverIsolated: async () => {
      events.push("discover-isolated")
      return options.isolated
    },
    inspect: async (value) => {
      const name = new URL(value.url).hostname
      events.push(`inspect:${name}`)
      const inspection = options.inspections[name]
      if (!inspection) throw new Error(`Missing inspection for ${name}`)
      return inspection
    },
    ensureShared: async () => {
      events.push("ensure-shared")
      return options.sharedReplacement ?? boc
    },
    ensureIsolated: async () => {
      events.push("ensure-isolated")
      return options.isolatedReplacement ?? isolated
    },
    stopShared: async () => {
      events.push("stop-shared")
    },
  }
}

function endpoint(url: string): Endpoint {
  return { url: `http://${url}` }
}

function responseFrom(responses: Response[]) {
  const response = responses.shift()
  if (!response) throw new Error("Missing response")
  return response
}
