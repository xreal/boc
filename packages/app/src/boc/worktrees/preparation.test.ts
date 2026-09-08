import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client/promise"
import { createData } from "@opencode-ai/client/solid"
import { Session } from "@opencode-ai/schema/session"
import { createRoot } from "solid-js"
import { createWorktree } from "@/workspaces/create"

test("uses Boc preparation when an operation ID is provided", async () => {
  const project = { id: "proj_clone", directory: "/copies/repo", canonical: "/copies/repo" }
  const operationID = Session.ID.create()
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        requests.push(request)
        if (request.method === "POST") {
          return Response.json({
            operationID,
            status: "succeeded",
            phase: "starting-environment",
            startedAt: 1,
            updatedAt: 2,
            endedAt: 2,
            log: "ready\n",
            truncated: false,
            directory: "/created",
          })
        }
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
      expect(await createWorktree({ api, data, directory: project.directory, project, operationID })).toBe("/created")
      const request = requests.find((request) => request.method === "POST")
      expect(request?.url).toBe(
        `http://localhost:3000/api/boc/worktree/prepare?location%5Bdirectory%5D=${encodeURIComponent(project.directory)}`,
      )
      expect(await request?.json()).toEqual({
        operationID,
        worktree: { strategy: "git", from: project.canonical },
      })
    } finally {
      dispose()
    }
  })
})
