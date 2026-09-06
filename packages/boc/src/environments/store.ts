import { Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

const StoredRun = Schema.Struct({
  id: Schema.String,
  action: Schema.Literals(["setup", "start", "stop", "remove"]),
  status: Schema.Literals(["running", "succeeded", "failed", "cancelled", "unknown"]),
  startedAt: Schema.Number,
  endedAt: Schema.optional(Schema.Number),
  exitCode: Schema.optional(Schema.Number),
  log: Schema.String,
  truncated: Schema.Boolean,
  sessionID: Schema.String,
  ptyID: Schema.optional(Schema.String),
  outputOffset: Schema.Number,
  phase: Schema.Number,
})

const Record = Schema.Struct({
  version: Schema.Literal(1),
  backend: Schema.Literal("local"),
  projectID: Schema.String,
  directory: Schema.String,
  owner: Schema.Struct({
    token: Schema.String,
    strategy: Schema.Literals(["git", "boc/rift"]),
    gitDirectory: Schema.String,
  }),
  assignment: Schema.optional(
    Schema.Struct({
      stackID: Schema.String,
      composeProject: Schema.String,
      infrastructureProject: Schema.String,
      host: Schema.String,
      url: Schema.String,
      sourceDirectory: Schema.String,
      configFile: Schema.String,
    }),
  ),
  http: Schema.optional(
    Schema.Union([
      Schema.Struct({ status: Schema.Literal("unknown") }),
      Schema.Struct({ status: Schema.Literal("ready"), checkedAt: Schema.Number, statusCode: Schema.Number }),
      Schema.Struct({ status: Schema.Literal("unreachable"), checkedAt: Schema.Number }),
    ]),
  ),
  latestRun: Schema.optional(StoredRun),
})

export type EnvironmentRun = {
  id: string
  action: "setup" | "start" | "stop" | "remove"
  status: "running" | "succeeded" | "failed" | "cancelled" | "unknown"
  startedAt: number
  endedAt?: number
  exitCode?: number
  log: string
  truncated: boolean
  sessionID: string
  ptyID?: string
  outputOffset: number
  phase: number
}

export type EnvironmentRecord = {
  version: 1
  backend: "local"
  projectID: string
  directory: string
  owner: { token: string; strategy: "git" | "boc/rift"; gitDirectory: string }
  assignment?: {
    stackID: string
    composeProject: string
    infrastructureProject: string
    host: string
    url: string
    sourceDirectory: string
    configFile: string
  }
  http?:
    | { status: "unknown" }
    | { status: "ready"; checkedAt: number; statusCode: number }
    | { status: "unreachable"; checkedAt: number }
  latestRun?: EnvironmentRun
}

const decode = Schema.decodeUnknownOption(Record)

export function createEnvironmentStore(directory: string) {
  const records = new Map<string, EnvironmentRecord>()
  const file = (projectID: string, checkout: string) => path.join(directory, `${key(projectID, checkout)}.json`)

  return {
    read: async (projectID: string, checkout: string) => {
      const cacheKey = key(projectID, checkout)
      const cached = records.get(cacheKey)
      if (cached) return cached
      const value = await Bun.file(file(projectID, checkout))
        .json()
        .catch(() => undefined)
      const decoded = Option.getOrUndefined(decode(value))
      const record: EnvironmentRecord | undefined = decoded
        ? {
            ...decoded,
            owner: { ...decoded.owner },
            assignment: decoded.assignment ? { ...decoded.assignment } : undefined,
            http: decoded.http ? { ...decoded.http } : undefined,
            latestRun: decoded.latestRun ? { ...decoded.latestRun } : undefined,
          }
        : undefined
      if (record && record.projectID === projectID && record.directory === checkout) records.set(cacheKey, record)
      return record?.projectID === projectID && record.directory === checkout ? record : undefined
    },
    write: async (record: EnvironmentRecord) => {
      await fs.mkdir(directory, { recursive: true })
      const destination = file(record.projectID, record.directory)
      const temporary = `${destination}.${randomUUID()}.tmp`
      await Bun.write(temporary, `${JSON.stringify(record, undefined, 2)}\n`)
      await fs.rename(temporary, destination)
      records.set(key(record.projectID, record.directory), record)
    },
  }
}

function key(projectID: string, directory: string) {
  return createHash("sha256").update(projectID).update("\0").update(directory).digest("hex").slice(0, 32)
}
