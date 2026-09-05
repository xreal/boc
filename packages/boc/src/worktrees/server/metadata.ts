import { Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { RIFT_BACKEND_VERSION } from "../shared/capability"

const RiftCheckout = Schema.Struct({
  version: Schema.Literal(1),
  state: Schema.Literals(["creating", "active", "removed"]),
  sourceDirectory: Schema.String,
  templateDirectory: Schema.String,
  directory: Schema.String,
  registry: Schema.String,
  commit: Schema.String,
  marker: Schema.optional(Schema.String),
  artifactVersion: Schema.Literal(RIFT_BACKEND_VERSION),
})
export type RiftCheckout = typeof RiftCheckout.Type

const RiftTemplateOwner = Schema.Struct({
  version: Schema.Literal(1),
  sourceDirectory: Schema.String,
  artifactVersion: Schema.Literal(RIFT_BACKEND_VERSION),
})

const decodeCheckout = Schema.decodeUnknownOption(RiftCheckout)

export function createMetadataStore(stateDirectory: string) {
  const metadataDirectory = path.join(stateDirectory, "metadata")
  const file = (directory: string) => path.join(metadataDirectory, `${key(directory)}.json`)

  const readFile = async (filename: string) => {
    const value = await Bun.file(filename)
      .json()
      .catch(() => undefined)
    return Option.getOrUndefined(decodeCheckout(value))
  }

  return {
    read: (directory: string) => readFile(file(directory)),
    list: async () => {
      const files = await fs.readdir(metadataDirectory).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []
        throw error
      })
      return (
        await Promise.all(
          files.filter((name) => name.endsWith(".json")).map((name) => readFile(path.join(metadataDirectory, name))),
        )
      ).filter((record): record is RiftCheckout => record !== undefined)
    },
    write: async (record: RiftCheckout) => {
      await fs.mkdir(metadataDirectory, { recursive: true })
      const destination = file(record.directory)
      const temporary = `${destination}.${randomUUID()}.tmp`
      await Bun.write(temporary, `${JSON.stringify(record, undefined, 2)}\n`)
      await fs.rename(temporary, destination)
    },
    remove: (records: readonly RiftCheckout[]) => Promise.all(records.map((record) => fs.rm(file(record.directory)))),
  }
}

export function metadataKey(value: string) {
  return key(value)
}

export async function claimTemplateRoot(directory: string, sourceDirectory: string) {
  const parent = path.dirname(directory)
  await fs.mkdir(parent, { recursive: true })
  const parentStat = await fs.lstat(parent)
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) return false

  const created = await fs.mkdir(directory).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return false
      throw error
    },
  )
  if (created) {
    await Bun.write(
      path.join(directory, ".boc-rift-owner.json"),
      `${JSON.stringify({ version: 1, sourceDirectory, artifactVersion: RIFT_BACKEND_VERSION }, undefined, 2)}\n`,
    )
    return true
  }

  const stat = await fs.lstat(directory).catch(() => undefined)
  if (!stat?.isDirectory() || stat.isSymbolicLink()) return false
  const value = await Bun.file(path.join(directory, ".boc-rift-owner.json"))
    .json()
    .catch(() => undefined)
  const owner = Option.getOrUndefined(Schema.decodeUnknownOption(RiftTemplateOwner)(value))
  return owner?.sourceDirectory === sourceDirectory
}

function key(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24)
}
