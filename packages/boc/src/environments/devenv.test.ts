import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createStackAssignment,
  inspectContainers,
  inspectStack,
  preflight,
  resolveDevenv,
  runCommand,
  type DevenvInstallation,
} from "./devenv"

const cleanup: string[] = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe("devenv adapter", () => {
  test("reports Docker health separately from running state and preserves published ports", async () => {
    const root = await temporary("devenv-containers-")
    const installation = fixtureInstallation(root)
    const stack = createStackAssignment(installation, path.join(root, "src", ".lane", "trees", "checkout"))
    if (!stack) throw new Error("Expected stack assignment")
    const container = {
      Id: "a".repeat(64),
      Name: "/devenv-checkout-shop-1",
      Config: {
        Labels: {
          "com.docker.compose.project": stack.composeProject,
          "com.docker.compose.service": "shop",
          "com.docker.compose.project.working_dir": root,
          "com.docker.compose.project.config_files": `${path.join(root, "docker-compose.yml")},${path.join(root, "docker-compose.worktree.yml")}`,
        },
      },
      State: { Running: true, Status: "running", ExitCode: 0, Health: { Status: "unhealthy" } },
      NetworkSettings: { Ports: { "443/tcp": [{ HostIp: "127.0.0.1", HostPort: "8443" }], "80/tcp": null } },
    }
    const inspect = () =>
      inspectContainers(installation, stack, async (command) => ({
        exitCode: 0,
        stderr: "",
        stdout: command.args[0] === "ps" ? `${container.Id}\n` : JSON.stringify([container]),
      }))
    expect(await inspect()).toMatchObject({
      status: "running",
      owned: true,
      items: [{ service: "shop", health: "unhealthy", ports: ["127.0.0.1:8443 → 443/tcp"] }],
    })
    container.Config.Labels["com.docker.compose.project"] = "other-project"
    expect(await inspect()).toMatchObject({ status: "unknown", owned: false })
  })

  test("bounds real process output while draining both streams and preserving UTF-8", async () => {
    const result = await runCommand({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('✓'.repeat(30000)); process.stderr.write('warning\\n')"],
      outputLimit: 1024,
    })
    expect(result.exitCode).toBe(0)
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1024)
    expect(result.stdout).not.toContain("�")
    expect(result.stderr).toBe("warning\n")
  })

  test("resolves the active executable and Lane lifecycle scripts", async () => {
    const root = await temporary("devenv-resolution-")
    const bin = path.join(root, "bin")
    const installation = path.join(root, "installation")
    await Promise.all([fs.mkdir(bin), fs.mkdir(path.join(installation, "scripts"), { recursive: true })])
    await Promise.all([
      executable(path.join(installation, "devenv.sh")),
      executable(path.join(installation, "scripts", "worktree-up.sh")),
      executable(path.join(installation, "scripts", "worktree-down.sh")),
    ])
    await fs.symlink(path.join(installation, "devenv.sh"), path.join(bin, "devenv"))

    const resolved = await resolveDevenv({ PATH: bin, HOME: root, DEVENV_INFRASTRUCTURE_PROJECT: "shared" })

    expect(resolved).toMatchObject({
      executable: path.join(bin, "devenv"),
      root: installation,
      up: path.join(installation, "scripts", "worktree-up.sh"),
      down: path.join(installation, "scripts", "worktree-down.sh"),
    })
    expect(resolved?.environment).toMatchObject({
      DEVENV_BIN: path.join(installation, "devenv.sh"),
      DEVENV_INFRASTRUCTURE_PROJECT: "shared",
    })
  })

  test("derives and validates the convention-owned Lane stack", async () => {
    const root = await temporary("devenv-contract-")
    const checkout = path.join(root, "src", ".lane", "trees", "PC_123-feature")
    await fs.mkdir(checkout, { recursive: true })
    const installation = fixtureInstallation(root)

    const assignment = createStackAssignment(installation, checkout, "bergfreunde.de")

    expect(assignment).toBeDefined()
    if (!assignment) throw new Error("Expected a Lane stack assignment")
    expect(assignment).toEqual({
      stackID: "pc-123-feature",
      composeProject: "devenv-pc-123-feature",
      infrastructureProject: path.basename(root),
      host: "pc-123-feature.bergfreunde.de.localhost",
      url: "https://pc-123-feature.bergfreunde.de.localhost/",
      sourceDirectory: checkout,
    })
    expect(inspectStack(installation, checkout)).toEqual({ status: "unconfigured" })
    expect(inspectStack(installation, checkout, assignment)).toEqual({ status: "configured", assignment })
    expect(inspectStack(installation, checkout, { ...assignment, composeProject: "devenv-other" })).toEqual({
      status: "invalid",
    })
    expect(createStackAssignment(installation, path.join(root, "another-checkout"))).toBeUndefined()
    expect(createStackAssignment(installation, checkout, "https://bergfreunde.de")).toBeUndefined()
  })

  test("uses the Lane network contract during setup preflight", async () => {
    const root = await temporary("devenv-preflight-")
    const checkout = path.join(root, "src", ".lane", "trees", "checkout")
    await Promise.all([
      fs.mkdir(path.join(checkout, "shop"), { recursive: true }),
      fs.mkdir(path.join(root, "src", "common", "config"), { recursive: true }),
      fs.mkdir(path.join(root, "src", "shop", "source"), { recursive: true }),
      fs.mkdir(path.join(root, "secrets"), { recursive: true }),
    ])
    await Bun.write(path.join(root, "src", "shop", "source", ".env"), "TEST=1\n")
    const commands: ReadonlyArray<string>[] = []

    expect(
      await preflight(fixtureInstallation(root), checkout, "setup", async (command) => {
        commands.push(command.args)
        return { exitCode: 0, stdout: "", stderr: "" }
      }),
    ).toBe(true)
    expect(commands).toEqual([["network", "inspect", "devenv-worktree-infra", "devenv-worktree-ingress"]])
  })
})

function fixtureInstallation(root: string): DevenvInstallation {
  return {
    executable: path.join(root, "devenv.sh"),
    up: path.join(root, "scripts", "worktree-up.sh"),
    down: path.join(root, "scripts", "worktree-down.sh"),
    root,
    environment: {},
  }
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
