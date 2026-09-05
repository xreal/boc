import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "yaml"

const requiredManifests = new Map([
  ["latest.yml", 1],
  ["latest-mac.yml", 1],
  ["latest-linux.yml", 1],
])

const releaseAssetPattern = /\.(?:exe|dmg|zip|appimage|deb|rpm)(?:\.blockmap)?$/i

export type ReleaseAsset = {
  name: string
  path: string
  size: number
  sha256: string
  sha512: string
}

export type ReleaseManifest = {
  name: string
  content: string
}

export async function prepareRelease(directory: string, version: string) {
  const files = await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: path.resolve(directory), absolute: true, onlyFiles: true }),
  )
  const assets = await readAssets(files, version)
  const sources = await Promise.all(
    files
      .filter((file) => requiredManifests.has(path.basename(file)))
      .map(async (file) => ({
        path: file,
        name: path.basename(file),
        manifest: parseManifest(await Bun.file(file).text()),
      })),
  )

  for (const [name, count] of requiredManifests) {
    const found = sources.filter((source) => source.name === name)
    if (found.length !== count) throw new Error(`Expected ${count} ${name} file(s), found ${found.length}`)
  }

  for (const source of sources) {
    if (source.manifest.version !== version) {
      throw new Error(`${source.path} contains version ${source.manifest.version}; expected ${version}`)
    }
    for (const file of source.manifest.files) {
      if (path.basename(file.url) !== file.url)
        throw new Error(`${source.path} contains a non-local asset URL: ${file.url}`)
      const asset = assets.find((candidate) => candidate.name === file.url)
      if (!asset) throw new Error(`${source.path} references missing asset ${file.url}`)
      if (asset.size !== file.size) throw new Error(`${file.url} size does not match ${source.path}`)
      if (asset.sha512 !== file.sha512) throw new Error(`${file.url} checksum does not match ${source.path}`)
    }
  }

  const manifests = [...requiredManifests.keys()].map((name) => {
    const group = sources.filter((source) => source.name === name).map((source) => source.manifest)
    const files = group.flatMap((manifest) => manifest.files).sort((left, right) => left.url.localeCompare(right.url))
    if (new Set(files.map((file) => file.url)).size !== files.length) {
      throw new Error(`${name} contains duplicate asset URLs`)
    }
    const releaseDate = group
      .map((manifest) => manifest.releaseDate)
      .sort()
      .at(-1)
    if (!releaseDate) throw new Error(`${name} has no release date`)
    return {
      name,
      content: stringify({
        version,
        files,
        releaseDate,
      }),
    } satisfies ReleaseManifest
  })

  return { assets, manifests }
}

async function readAssets(files: string[], version: string) {
  const candidates = files.filter((file) => releaseAssetPattern.test(file))
  const duplicates = candidates
    .map((file) => path.basename(file))
    .filter((name, index, names) => names.indexOf(name) !== index)
  if (duplicates.length) throw new Error(`Release asset names must be unique: ${[...new Set(duplicates)].join(", ")}`)

  const assets: ReleaseAsset[] = []
  for (const file of candidates) {
    const name = path.basename(file)
    if (!name.includes(`-${version}-`)) throw new Error(`Release asset is not versioned: ${name}`)
    const metadata = await stat(file)
    const checksums = await digest(file)
    assets.push({ name, path: file, size: metadata.size, ...checksums })
  }
  if (!assets.length) throw new Error("No release assets found")
  return assets.sort((left, right) => left.name.localeCompare(right.name))
}

async function digest(file: string) {
  const sha256 = createHash("sha256")
  const sha512 = createHash("sha512")
  for await (const chunk of createReadStream(file)) {
    sha256.update(chunk)
    sha512.update(chunk)
  }
  return { sha256: sha256.digest("hex"), sha512: sha512.digest("base64") }
}

function parseManifest(content: string) {
  const input: unknown = parse(content)
  if (!isRecord(input) || typeof input.version !== "string" || typeof input.releaseDate !== "string") {
    throw new Error("Invalid updater manifest")
  }
  if (!Array.isArray(input.files)) throw new Error("Updater manifest has no files")
  const files = input.files.map((file) => {
    if (
      !isRecord(file) ||
      typeof file.url !== "string" ||
      typeof file.sha512 !== "string" ||
      typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0
    ) {
      throw new Error("Updater manifest contains an invalid file")
    }
    const blockMapSize = file.blockMapSize
    if (
      blockMapSize !== undefined &&
      (typeof blockMapSize !== "number" || !Number.isSafeInteger(blockMapSize) || blockMapSize <= 0)
    ) {
      throw new Error("Updater manifest contains an invalid block map size")
    }
    return {
      url: file.url,
      sha512: file.sha512,
      size: file.size,
      ...(blockMapSize === undefined ? {} : { blockMapSize }),
    }
  })
  if (!files.length) throw new Error("Updater manifest has no files")
  if (Number.isNaN(Date.parse(input.releaseDate))) throw new Error("Updater manifest has an invalid release date")
  return { version: input.version, files, releaseDate: input.releaseDate }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}
