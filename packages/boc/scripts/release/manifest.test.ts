import { createHash } from "node:crypto"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, test } from "bun:test"
import { stringify } from "yaml"
import { prepareRelease } from "./manifest"

const fixtures: string[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => rm(fixture, { recursive: true, force: true })))
})

test("merges architecture manifests and verifies versioned release assets", async () => {
  const directory = await fixture("1.2.3")
  const release = await prepareRelease(directory, "1.2.3")

  expect(release.manifests.map((manifest) => manifest.name)).toEqual([
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
    "latest-linux-arm64.yml",
  ])
  expect(release.manifests.find((manifest) => manifest.name === "latest.yml")?.content).toContain(
    "boc-desktop-1.2.3-win-arm64.exe",
  )
  expect(release.manifests.find((manifest) => manifest.name === "latest.yml")?.content).toContain(
    "boc-desktop-1.2.3-win-x64.exe",
  )
  expect(release.assets).toHaveLength(6)
  expect(release.assets.every((asset) => asset.name.includes("-1.2.3-"))).toBe(true)
})

test("rejects an incomplete platform set", async () => {
  const directory = await fixture("1.2.3")
  await rm(path.join(directory, "linux-arm64", "latest-linux-arm64.yml"))
  await expect(prepareRelease(directory, "1.2.3")).rejects.toThrow("Expected 1 latest-linux-arm64.yml file(s), found 0")
})

test("rejects a manifest built for another version", async () => {
  const directory = await fixture("1.2.3")
  const file = path.join(directory, "linux-x64", "latest-linux.yml")
  await Bun.write(file, (await Bun.file(file).text()).replace("version: 1.2.3", "version: 1.2.4"))
  await expect(prepareRelease(directory, "1.2.3")).rejects.toThrow("contains version 1.2.4; expected 1.2.3")
})

test("prepares a complete release without cloud credentials in dry-run mode", async () => {
  const directory = await fixture("1.2.3")
  const manifests = path.join(directory, "merged")
  const command = Bun.spawn(
    [
      process.execPath,
      path.join(import.meta.dir, "publish.ts"),
      "--dir",
      directory,
      "--manifests-dir",
      manifests,
      "--version",
      "1.2.3",
      "--dry-run",
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [code, output, error] = await Promise.all([
    command.exited,
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
  ])

  expect(error).toBe("")
  expect(code).toBe(0)
  expect(output).toContain("Dry run complete for Boc 1.2.3")
  expect(await Bun.file(path.join(manifests, "latest.yml")).exists()).toBe(true)
  expect(await Bun.file(path.join(manifests, "SHA256SUMS-1.2.3.txt")).exists()).toBe(true)
})

async function fixture(version: string) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "boc-release-"))
  fixtures.push(directory)
  await Promise.all([
    writeManifest(directory, "windows-x64", "latest.yml", `boc-desktop-${version}-win-x64.exe`, version),
    writeManifest(directory, "windows-arm64", "latest.yml", `boc-desktop-${version}-win-arm64.exe`, version),
    writeManifest(directory, "mac-x64", "latest-mac.yml", `boc-desktop-${version}-mac-x64.zip`, version),
    writeManifest(directory, "mac-arm64", "latest-mac.yml", `boc-desktop-${version}-mac-arm64.zip`, version),
    writeManifest(directory, "linux-x64", "latest-linux.yml", `boc-desktop-${version}-linux-x64.AppImage`, version),
    writeManifest(
      directory,
      "linux-arm64",
      "latest-linux-arm64.yml",
      `boc-desktop-${version}-linux-arm64.AppImage`,
      version,
    ),
  ])
  return directory
}

async function writeManifest(directory: string, target: string, manifest: string, asset: string, version: string) {
  const targetDirectory = path.join(directory, target)
  await mkdir(targetDirectory, { recursive: true })
  const content = `${target}/${asset}\n`
  await Bun.write(path.join(targetDirectory, asset), content)
  await Bun.write(
    path.join(targetDirectory, manifest),
    stringify({
      version,
      files: [
        {
          url: asset,
          sha512: createHash("sha512").update(content).digest("base64"),
          size: Buffer.byteLength(content),
        },
      ],
      releaseDate: "2026-09-05T12:00:00.000Z",
    }),
  )
}
