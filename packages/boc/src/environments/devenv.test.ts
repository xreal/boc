import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inspectStack, preflight, resolveDevenv } from "./devenv"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("devenv adapter", () => {
  test("resolves the active executable entry and derives its fixed setup adapter", async () => {
    const root = await temporary("devenv-resolution-")
    const bin = path.join(root, "bin")
    const installation = path.join(root, "installation")
    await Promise.all([fs.mkdir(bin), fs.mkdir(path.join(installation, "scripts"), { recursive: true })])
    await Promise.all([
      executable(path.join(installation, "devenv.sh")),
      executable(path.join(installation, "scripts", "worktree-setup.sh")),
    ])
    await fs.symlink(path.join(installation, "devenv.sh"), path.join(bin, "devenv"))

    const resolved = await resolveDevenv({ PATH: bin, HOME: root })

    expect(resolved).toMatchObject({
      executable: path.join(bin, "devenv"),
      root: installation,
      setup: path.join(installation, "scripts", "worktree-setup.sh"),
    })
    expect(resolved?.environment.DEVENV_BIN).toBe(path.join(installation, "devenv.sh"))
  })

  test("accepts only a complete generated stack contract for the canonical checkout", async () => {
    const root = await temporary("devenv-contract-")
    const checkout = path.join(root, "checkout with space")
    const config = path.join(root, ".devenv", "worktrees", "pc-123-a1b2.env")
    await Promise.all([
      fs.mkdir(checkout),
      fs.mkdir(path.dirname(config), { recursive: true }),
      fs.mkdir(path.join(root, "config"), { recursive: true }),
    ])
    await Bun.write(path.join(root, "config", "storefront-domains.txt"), "bergfreunde.de\n")
    await Bun.write(config, stackContract(checkout))
    const installation = { executable: "devenv", setup: "setup", root, environment: {} }

    expect(await inspectStack(installation, checkout)).toMatchObject({
      status: "configured",
      assignment: {
        stackID: "pc-123-a1b2",
        composeProject: "devenv-pc-123-a1b2",
        host: "pc-123-a1b2.bergfreunde.de.localhost",
        sourceDirectory: checkout,
      },
    })

    await Bun.write(config, stackContract(checkout).replace("STACK_HOST=pc-123-a1b2", "STACK_HOST=another-stack"))
    expect(await inspectStack(installation, checkout)).toEqual({ status: "invalid" })

    await Bun.write(config, stackContract(checkout))
    await Bun.write(path.join(path.dirname(config), "unrelated.env"), "this is not a generated assignment\n")
    expect(await inspectStack(installation, checkout)).toMatchObject({ status: "configured" })

    await Bun.write(config, `${stackContract(checkout)}this is not a generated assignment\n`)
    expect(await inspectStack(installation, checkout)).toEqual({ status: "invalid" })

    await Bun.write(config, `${stackContract(checkout)}DEVENV_SRC_PATH=${checkout}\n`)
    expect(await inspectStack(installation, checkout)).toEqual({ status: "invalid" })
  })

  test("uses the active devenv network defaults during setup preflight", async () => {
    const root = await temporary("devenv-preflight-")
    const checkout = path.join(root, "checkout")
    await Promise.all([
      fs.mkdir(path.join(checkout, "shop"), { recursive: true }),
      fs.mkdir(path.join(root, "src", "common", "config"), { recursive: true }),
      fs.mkdir(path.join(root, "src", "shop", "source"), { recursive: true }),
      fs.mkdir(path.join(root, "secrets"), { recursive: true }),
    ])
    await Bun.write(path.join(root, "src", "shop", "source", ".env"), "TEST=1\n")
    const installation = { executable: "devenv", setup: "setup", root, environment: {} }
    const commands: ReadonlyArray<string>[] = []

    expect(
      await preflight(installation, checkout, "setup", async (command) => {
        commands.push(command.args)
        return { exitCode: 0, stdout: "", stderr: "" }
      }),
    ).toBe(true)
    expect(commands).toEqual([
      ["network", "inspect", "devenv-worktree-infra", "devenv-worktree-ingress"],
    ])
  })
})

function stackContract(directory: string) {
  return [
    "STACK_ID=pc-123-a1b2",
    "STACK_DOMAIN=bergfreunde.de",
    "COMPOSE_PROJECT_NAME=devenv-pc-123-a1b2",
    "DEVENV_SHARED_INFRASTRUCTURE=true",
    "INFRASTRUCTURE_PROJECT_NAME=devenv",
    "STACK_HOST=pc-123-a1b2.bergfreunde.de.localhost",
    "SHOP_CONTAINER_NAME=devenv-pc-123-a1b2-shop",
    `DEVENV_SRC_PATH=${directory.replaceAll(" ", "\\ ")}`,
    "",
  ].join("\n")
}

async function temporary(prefix: string) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  cleanup.push(directory)
  return directory
}

async function executable(file: string) {
  await Bun.write(file, "#!/usr/bin/env bash\n")
  await fs.chmod(file, 0o755)
}
