import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client/promise"
import { createData } from "@opencode-ai/client/solid"
import { createRoot } from "solid-js"
import { createWorktree } from "../../workspaces/create"

test("uses an optional checkout strategy without changing cache synchronization", async () => {
  const project = { id: "proj_clone", directory: "/copies/repo", canonical: "/copies/repo" }
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.method === "POST") return Response.json({ directory: "/created" })
        return Response.json({ directory: "/created", project })
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
        strategy: async (input) => {
          expect(input.project).toEqual(project)
          expect(input.directory).toBe(project.directory)
          return { strategy: "boc/rift", directory: "/copies/" }
        },
      })

      expect(directory).toBe("/created")
      expect(await requests.find((request) => request.method === "POST")?.json()).toEqual({
        strategy: "boc/rift",
        from: project.canonical,
        directory: "/copies/",
      })
      expect(data.location.info({ directory })).toEqual({ directory, project })
    } finally {
      dispose()
    }
  })
})
