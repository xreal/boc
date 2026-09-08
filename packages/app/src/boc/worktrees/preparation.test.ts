import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client/promise"
import { createData } from "@opencode-ai/client/solid"
import { Session } from "@opencode-ai/schema/session"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { createRoot } from "solid-js"
import { createWorktree } from "@/workspaces/create"
import { prepareWorktree } from "./preparation"

test("polls running preparation at its source Location until completion", async () => {
  const requests: Request[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init))
        return Response.json({
          output: {
            operationID: "prepare_fixture",
            status: requests.length < 3 ? "running" : "succeeded",
            phase: "starting-environment",
            startedAt: 1,
            updatedAt: requests.length,
            log: "starting\n",
            truncated: false,
            ...(requests.length < 3 ? {} : { directory: "/created", endedAt: 3 }),
          },
        })
      },
      { preconnect() {} },
    ),
  })

  expect(
    await prepareWorktree({
      api,
      location: "/source",
      operationID: "prepare_fixture",
      worktree: { strategy: "git", from: "/source" },
    }),
  ).toEqual({ directory: AbsolutePath.make("/created") })
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    "/api/rpc/boc.worktrees.v1/prepare",
    "/api/rpc/boc.worktrees.v1/preparation",
    "/api/rpc/boc.worktrees.v1/preparation",
  ])
  expect(requests.every((request) => new URL(request.url).searchParams.get("location[directory]") === "/source")).toBe(
    true,
  )
})

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
            output: {
              operationID,
              status: "succeeded",
              phase: "starting-environment",
              startedAt: 1,
              updatedAt: 2,
              endedAt: 2,
              log: "ready\n",
              truncated: false,
              directory: "/created",
            },
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
        `http://localhost:3000/api/rpc/boc.worktrees.v1/prepare?location%5Bdirectory%5D=${encodeURIComponent(project.directory)}`,
      )
      expect(await request?.json()).toEqual({
        input: { operationID, worktree: { strategy: "git", from: project.canonical } },
      })
    } finally {
      dispose()
    }
  })
})
