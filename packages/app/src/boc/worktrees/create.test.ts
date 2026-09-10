import { expect, test } from "bun:test"
import { OpenCode } from "@opencode/client/promise"
import { createData } from "@opencode/client/solid"
import { createRoot } from "solid-js"
import { createWorktree } from "../../workspaces/create"
import { bocWorktreeStrategy } from "./policy"

test("uses Lane once and synchronizes the server-selected directory", async () => {
  const project = { id: "proj_clone", directory: "/copies/repo", canonical: "/copies/repo" }
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.method === "POST") return Response.json({ directory: "/copies/repo/.lane/trees/topic" })
        return Response.json({ directory: "/copies/repo/.lane/trees/topic", project })
      },
      { preconnect() {} },
    ),
  })

  await createRoot(async (dispose) => {
    const data = createData({
      api: () => api,
      directory: project.directory,
      event: { on: () => () => {}, listen: () => () => {} },
    })
    try {
      const directory = await createWorktree({
        api,
        data,
        directory: project.directory,
        project,
        strategy: "lane",
      })

      expect(directory).toBe("/copies/repo/.lane/trees/topic")
      const creations = requests.filter((request) => request.method === "POST")
      expect(creations).toHaveLength(1)
      expect(await creations[0].json()).toEqual({
        strategy: "lane",
        from: project.canonical,
      })
      expect(data.location.info({ directory })).toEqual({ directory, project })
    } finally {
      dispose()
    }
  })
})

test("returns a Lane failure without retrying with Git", async () => {
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        return Response.json({ message: "Lane strategy is unavailable" }, { status: 500 })
      },
      { preconnect() {} },
    ),
  })

  await expect(
    createWorktree({
      api,
      data: { location: { syncInfo: async () => undefined } } as never,
      directory: "/project",
      project: { id: "project", directory: "/project", canonical: "/project" },
      strategy: "lane",
    }),
  ).rejects.toBeDefined()
  expect(requests).toHaveLength(1)
  expect(await requests[0].json()).toMatchObject({ strategy: "lane" })
})

test("selects Lane only for Boc products", () => {
  expect(bocWorktreeStrategy("boc")).toBe("lane")
  expect(bocWorktreeStrategy("boc-dev")).toBe("lane")
  expect(bocWorktreeStrategy("")).toBeUndefined()
  expect(bocWorktreeStrategy("beta")).toBeUndefined()
})
