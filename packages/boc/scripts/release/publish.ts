#!/usr/bin/env bun

import { mkdir, stat } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { parse } from "yaml"
import { prepareRelease, type ReleaseAsset } from "./manifest"

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    dir: { type: "string" },
    version: { type: "string" },
    phase: { type: "string", default: "all" },
    bucket: { type: "string", default: "boc-releases" },
    url: { type: "string", default: "https://boc-updates.bergdev.de" },
    "manifests-dir": { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
})

if (!values.dir) throw new Error("--dir is required")
if (!values.version?.match(/^\d+\.\d+\.\d+$/)) throw new Error("--version must be a stable semantic version")
if (!values["manifests-dir"]) throw new Error("--manifests-dir is required")
if (values.phase !== "all" && values.phase !== "assets" && values.phase !== "manifests") {
  throw new Error("--phase must be all, assets, or manifests")
}

const release = await prepareRelease(values.dir, values.version)
const manifestDirectory = path.resolve(values["manifests-dir"])
await mkdir(manifestDirectory, { recursive: true })
await Promise.all(
  release.manifests.map((manifest) => Bun.write(path.join(manifestDirectory, manifest.name), manifest.content)),
)
const checksums = release.assets.map((asset) => `${asset.sha256}  ${asset.name}`).join("\n") + "\n"
const checksumPath = path.join(manifestDirectory, `SHA256SUMS-${values.version}.txt`)
await Bun.write(checksumPath, checksums)
const checksumFile = Bun.file(checksumPath)
const checksumContent = await checksumFile.arrayBuffer()
const checksumAsset: ReleaseAsset = {
  name: path.basename(checksumPath),
  path: checksumPath,
  size: checksumFile.size,
  sha256: new Bun.CryptoHasher("sha256").update(checksumContent).digest("hex"),
  sha512: new Bun.CryptoHasher("sha512").update(checksumContent).digest("base64"),
}

console.log(`Prepared ${release.assets.length} artifacts and ${release.manifests.length} updater manifests`)
if (values["dry-run"]) {
  console.log(`Dry run complete for Boc ${values.version}`)
  process.exit(0)
}

const accountID = process.env.CLOUDFLARE_ACCOUNT_ID
const accessKeyID = process.env.R2_ACCESS_KEY_ID
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
if (!accountID || !accessKeyID || !secretAccessKey) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are required")
}
if (!Bun.which("aws")) throw new Error("AWS CLI is required for multipart R2 uploads")

const endpoint = `https://${accountID}.r2.cloudflarestorage.com`
const awsEnvironment = {
  ...process.env,
  AWS_ACCESS_KEY_ID: accessKeyID,
  AWS_SECRET_ACCESS_KEY: secretAccessKey,
  AWS_REGION: "auto",
  AWS_DEFAULT_REGION: "auto",
  AWS_EC2_METADATA_DISABLED: "true",
}

if (values.phase === "all" || values.phase === "assets") {
  for (const asset of [...release.assets, checksumAsset]) await publishAsset(asset)
}

if (values.phase === "all" || values.phase === "manifests") {
  for (const manifest of release.manifests) {
    const file = path.join(manifestDirectory, manifest.name)
    await upload(file, manifest.name, "application/yaml", "no-store, max-age=0")
    const response = await fetch(`${publicURL(manifest.name)}?version=${values.version}&time=${Date.now()}`, {
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`Published manifest is unavailable: ${manifest.name} (${response.status})`)
    const input: unknown = parse(await response.text())
    if (!isRecord(input) || input.version !== values.version) {
      throw new Error(`Published manifest has the wrong version: ${manifest.name}`)
    }
    console.log(`Activated ${manifest.name}`)
  }
}

async function publishAsset(asset: ReleaseAsset) {
  const existing = await inspect(asset.name)
  if (existing) {
    if (existing.size !== asset.size || existing.sha512 !== asset.sha512) {
      throw new Error(`Refusing to overwrite different immutable release asset: ${asset.name}`)
    }
    console.log(`Reusing ${asset.name}`)
  } else {
    await upload(asset.path, asset.name, contentType(asset.name), "public, max-age=31536000, immutable", asset.sha512)
    console.log(`Uploaded ${asset.name}`)
  }

  const response = await fetch(`${publicURL(asset.name)}?version=${values.version}`, {
    method: "HEAD",
    cache: "no-store",
  })
  if (!response.ok) throw new Error(`Published asset is unavailable: ${asset.name} (${response.status})`)
  if (Number(response.headers.get("content-length")) !== asset.size) {
    throw new Error(`Published asset has the wrong size: ${asset.name}`)
  }
}

async function inspect(name: string) {
  const command = Bun.spawn(
    [
      "aws",
      "s3api",
      "head-object",
      "--bucket",
      values.bucket,
      "--key",
      name,
      "--endpoint-url",
      endpoint,
      "--output",
      "json",
    ],
    { env: awsEnvironment, stdout: "pipe", stderr: "pipe" },
  )
  const [code, output, error] = await Promise.all([
    command.exited,
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
  ])
  if (code !== 0 && /(?:404|Not Found)/i.test(error)) return
  if (code !== 0) throw new Error(`Unable to inspect ${name}: ${error.trim()}`)
  const input: unknown = JSON.parse(output)
  if (!isRecord(input) || !Number.isSafeInteger(input.ContentLength) || !isRecord(input.Metadata)) {
    throw new Error(`R2 returned invalid metadata for ${name}`)
  }
  return {
    size: Number(input.ContentLength),
    sha512: typeof input.Metadata.sha512 === "string" ? input.Metadata.sha512 : undefined,
  }
}

async function upload(file: string, name: string, type: string, cacheControl: string, sha512?: string) {
  const fileMetadata = await stat(file)
  if (!fileMetadata.isFile() || fileMetadata.size === 0) throw new Error(`Cannot upload empty file: ${file}`)
  const command = Bun.spawn(
    [
      "aws",
      "s3",
      "cp",
      file,
      `s3://${values.bucket}/${name}`,
      "--endpoint-url",
      endpoint,
      "--content-type",
      type,
      "--cache-control",
      cacheControl,
      ...(sha512 ? ["--metadata", `sha512=${sha512}`] : []),
      "--only-show-errors",
      "--no-progress",
    ],
    { env: awsEnvironment, stdout: "inherit", stderr: "inherit" },
  )
  if ((await command.exited) !== 0) throw new Error(`R2 upload failed: ${name}`)
}

function publicURL(name: string) {
  return new URL(name, `${values.url!.replace(/\/$/, "")}/`).toString()
}

function contentType(name: string) {
  const extension = name.toLowerCase()
  if (extension.endsWith(".exe")) return "application/vnd.microsoft.portable-executable"
  if (extension.endsWith(".dmg")) return "application/x-apple-diskimage"
  if (extension.endsWith(".zip")) return "application/zip"
  if (extension.endsWith(".deb")) return "application/vnd.debian.binary-package"
  if (extension.endsWith(".rpm")) return "application/x-rpm"
  if (extension.endsWith(".txt")) return "text/plain; charset=utf-8"
  return "application/octet-stream"
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}
