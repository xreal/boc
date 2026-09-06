export * as BocEnvironments from "./runtime"

import { RiftBackendService } from "../worktrees/server/backend"
import { BocWorktrees } from "../worktrees/server/runtime"
import { App } from "@opencode-ai/core/app"
import { Database } from "@opencode-ai/core/database/database"
import { Git } from "@opencode-ai/core/git"
import { PersistentPty } from "@opencode-ai/core/persistent-pty"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { WorktreeTable } from "@opencode-ai/core/worktree/sql"
import { Pty } from "@opencode-ai/schema/pty"
import { Session } from "@opencode-ai/schema/session"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Global } from "@opencode-ai/util/global"
import { and, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { createEnvironmentBackend, type EnvironmentBackend, type EnvironmentBackendOptions } from "./backend"
import type { ProcessHost } from "./process"

export class EnvironmentBackendService extends Context.Service<EnvironmentBackendService, EnvironmentBackend>()(
  "@boc/EnvironmentBackend",
) {}

type Options = {
  readonly installation?: EnvironmentBackendOptions["installation"]
}

export const configured = (options: Options = {}) =>
  makeGlobalNode({
    service: EnvironmentBackendService,
    layer: Layer.effect(
      EnvironmentBackendService,
      Effect.gen(function* () {
        const app = yield* App.Metadata
        const database = yield* Database.Service
        const git = yield* Git.Service
        const global = yield* Global.Service
        const persistentPty = yield* PersistentPty.Service
        const rift = yield* RiftBackendService
        const run = Effect.runPromiseWith(yield* Effect.context())
        const process: ProcessHost = {
          create: async (input) => {
            const terminal = await run(
              persistentPty.create(Session.ID.make(input.groupID), {
                command: input.command,
                args: input.args,
                cwd: input.cwd,
                title: input.title,
                env: input.env,
              }),
            )
            return {
              id: terminal.id,
              status: terminal.status,
              exitCode: terminal.exitCode,
              outputTail: terminal.output.tail,
            }
          },
          get: (id) =>
            run(persistentPty.get(Pty.ID.make(id))).then(
              (terminal) => ({
                id: terminal.id,
                status: terminal.status,
                exitCode: terminal.exitCode,
                outputTail: terminal.output.tail,
              }),
              () => undefined,
            ),
          observe: async (id, cursor, onOutput) => {
            let exited = false
            let outputOffset = cursor
            let resolveExit: (value: {
              exitCode?: number
              finalOffset: number
              disconnected?: boolean
            }) => void = () => {}
            const done = new Promise<{ exitCode?: number; finalOffset: number; disconnected?: boolean }>((resolve) => {
              resolveExit = resolve
            })
            const attachment = await run(
              persistentPty.attach(Pty.ID.make(id), {
                cursor,
                attachmentID: randomUUID(),
                role: "observer",
                onEvent: (event) => {
                  if (event.type === "output") {
                    outputOffset = event.end
                    onOutput({ data: event.data, end: event.end })
                  }
                  if (event.type !== "exited") return
                  exited = true
                  resolveExit({ exitCode: event.exitCode, finalOffset: event.finalOffset })
                },
                onEnd: () => {
                  if (!exited) resolveExit({ finalOffset: outputOffset, disconnected: true })
                },
              }),
            )
            outputOffset = Math.max(outputOffset, attachment.replay.endOffset)
            attachment.activate()
            return {
              replay: attachment.replay.data,
              replayEnd: attachment.replay.endOffset,
              truncated: attachment.replay.truncated,
              done,
              detach: attachment.detach,
            }
          },
          terminate: (id) => run(persistentPty.remove(Pty.ID.make(id))),
        }
        return EnvironmentBackendService.of(
          createEnvironmentBackend({
            enabled: app.channel === "boc",
            stateDirectory: path.join(global.state, "boc", "environments"),
            process,
            installation: options.installation,
            checkout: async (projectID, requestedDirectory) => {
              const directory = await fs.realpath(requestedDirectory).catch(() => undefined)
              if (!directory) return { available: false, reason: "checkout-unavailable" }
              const project = Project.ID.make(projectID)
              const checkoutDirectory = AbsolutePath.make(directory)
              const row = await run(
                database.db
                  .select({
                    strategy: WorktreeTable.strategy,
                    projectDirectory: ProjectTable.worktree,
                  })
                  .from(WorktreeTable)
                  .innerJoin(ProjectTable, eq(ProjectTable.id, WorktreeTable.project_id))
                  .where(and(eq(WorktreeTable.project_id, project), eq(WorktreeTable.directory, checkoutDirectory)))
                  .get(),
              )
              if (!row) return { available: false, reason: "checkout-not-registered" }
              if (directory === row.projectDirectory) return { available: false, reason: "checkout-not-isolated" }
              if (row.strategy === "git") {
                const repository = await run(git.repo.discover(directory as Parameters<typeof git.repo.discover>[0]))
                if (!repository || repository.worktree !== directory) {
                  return { available: false, reason: "checkout-ownership-mismatch" }
                }
                const worktrees = await run(git.worktree.list(repository)).catch(() => [])
                if (!worktrees.some((worktree) => worktree.directory === directory && worktree.kind === "linked")) {
                  return { available: false, reason: "checkout-ownership-mismatch" }
                }
                return {
                  available: true,
                  checkout: { directory, strategy: "git", gitDirectory: repository.gitDirectory },
                }
              }
              if (row.strategy === "boc/rift") {
                const ownership = await rift.ownership(directory)
                if (!ownership) return { available: false, reason: "checkout-ownership-mismatch" }
                const source = await run(
                  database.db
                    .select({ directory: WorktreeTable.directory })
                    .from(WorktreeTable)
                    .where(
                      and(
                        eq(WorktreeTable.project_id, project),
                        eq(WorktreeTable.directory, AbsolutePath.make(ownership.sourceDirectory)),
                      ),
                    )
                    .get(),
                )
                if (!source) return { available: false, reason: "checkout-ownership-mismatch" }
                const repository = await run(git.repo.discover(directory as Parameters<typeof git.repo.discover>[0]))
                if (!repository || repository.worktree !== directory) {
                  return { available: false, reason: "checkout-ownership-mismatch" }
                }
                return {
                  available: true,
                  checkout: { directory, strategy: "boc/rift", gitDirectory: repository.gitDirectory },
                }
              }
              return { available: false, reason: "checkout-not-isolated" }
            },
          }),
        )
      }),
    ),
    deps: [App.node, Database.node, Git.node, Global.node, PersistentPty.node, BocWorktrees.node],
  })

export const node = configured()
