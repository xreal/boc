import { describe, expect, test } from "bun:test"
import type { Endpoint } from "@opencode/client/service"
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
    expect(events).toEqual(["discover", "inspect:official", "discover-isolated", "ensure-isolated", "inspect:isolated"])
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
    expect(events).toEqual(["discover", "inspect:official", "discover-isolated", "inspect:isolated"])
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
      Response.json({ output: { protocol: 1 } }),
      new Response(
        JSON.stringify({
          output: {
            protocol: 1,
            version: "1",
            project: { id: "project", canonical: "/project" },
            location: { directory: "/project" },
            source: "bundled",
            scope: "project-on-server",
            categories: ["tool"],
            operations: ["info", "getState"],
          },
        }),
      ),
    ]

    expect(await inspectBocService(official, "/project", undefined, async () => responseFrom(responses))).toEqual({
      version: "1.2.3",
      boc: true,
    })
  })

  test("rejects an older Boc backend even when its server version matches", async () => {
    const requests: { url: URL; init?: RequestInit }[] = []
    const responses = [
      Response.json({ version: "1.2.3" }),
      Response.json({ output: { protocol: 1 } }),
      new Response("missing", { status: 404 }),
    ]
    expect(
      await inspectBocService(boc, "/project", { Authorization: "Basic fixture" }, async (input, init) => {
        requests.push({ url: new URL(String(input)), init })
        return responseFrom(responses)
      }),
    ).toEqual({ version: "1.2.3", boc: false })
    expect(requests.slice(1).map((request) => request.url.pathname)).toEqual([
      "/api/rpc/boc.environments.v1/info",
      "/api/rpc/boc.controls.v1/info",
    ])
    for (const request of requests.slice(1)) {
      expect(request.url.searchParams.get("location[directory]")).toBe("/project")
      expect(new Headers(request.init?.headers).get("Authorization")).toBe("Basic fixture")
    }
  })

  test("updates an isolated backend missing controls even at the same version", async () => {
    const events: string[] = []
    const current = endpoint("isolated-current")
    const lifecycle = fixture(events, {
      isolated,
      isolatedReplacement: current,
      inspections: {
        isolated: { version: "1.2.3", boc: false },
        "isolated-current": { version: "1.2.3", boc: true },
      },
    })
    expect(await connectBocService(lifecycle)).toEqual(current)
    expect(events).toEqual([
      "discover",
      "discover-isolated",
      "inspect:isolated",
      "stop-isolated",
      "ensure-isolated",
      "inspect:isolated-current",
    ])
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
    stopIsolated: async () => {
      events.push("stop-isolated")
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
