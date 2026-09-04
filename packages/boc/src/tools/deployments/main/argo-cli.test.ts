import { describe, expect, test } from "bun:test"
import { argoApplicationFixtures } from "../fixtures/argo"
import type { DeploymentSettings } from "../rpcs"
import { argoApplicationListArgs, readArgoFleet, supportsRequiredArgoFlags } from "./argo-cli"
import type { DeploymentCommand, DeploymentCommandResult, DeploymentCommandRunner } from "./command-runner"

const settings: DeploymentSettings = {
  argoProject: "shop-dev",
  applicationLabelKey: "app",
  applicationLabelValue: "shop",
  notificationsEnabled: true,
}

const help = `
  --output string
  --selector string
  --core
  --kube-context string
  --prompts-enabled
`

describe("Argo CLI boundary", () => {
  test("proves supported installed flags before every explicitly targeted dev read", async () => {
    const commands: DeploymentCommand[] = []
    const result = await readArgoFleet(
      {
        platform: "darwin",
        run: scriptedRunner(commands, [
          success("argocd: v3.1.7+e5d86e7"),
          success(help),
          success("production\ndev\nstaging\n"),
          success(JSON.stringify(argoApplicationFixtures)),
        ]),
      },
      settings,
    )

    expect(result.ok).toBe(true)
    expect(commands.map((command) => [command.executable, ...command.args])).toEqual([
      ["argocd", "version", "--client"],
      ["argocd", "app", "list", "--help"],
      ["kubectl", "config", "get-contexts", "-o", "name"],
      ["argocd", ...argoApplicationListArgs(settings)],
    ])
    expect(argoApplicationListArgs(settings)).toEqual([
      "app",
      "list",
      "--core",
      "--kube-context",
      "dev",
      "--output",
      "json",
      "--prompts-enabled=false",
      "--selector",
      "app=shop",
      "--project",
      "shop-dev",
    ])
    expect(result.statuses.argocd_cli?.context).toEqual({ version: "v3.1.7+e5d86e7" })
  })

  test("blocks clients that do not advertise the exact safety flags", async () => {
    const commands: DeploymentCommand[] = []
    const result = await readArgoFleet(
      {
        platform: "linux",
        run: scriptedRunner(commands, [success("argocd: v2.11.0"), success("--output --selector --prompts-enabled")]),
      },
      settings,
    )

    expect(result).toMatchObject({ ok: false, failure: { category: "unsafe-target" } })
    expect(commands).toHaveLength(2)
    expect(supportsRequiredArgoFlags(help)).toBe(true)
    expect(supportsRequiredArgoFlags("--core --output --selector")).toBe(false)
  })

  test("requires the exact dev kube context and never falls back to the current context", async () => {
    const commands: DeploymentCommand[] = []
    const result = await readArgoFleet(
      {
        platform: "darwin",
        run: scriptedRunner(commands, [success("argocd: v3.1.7"), success(help), success("development\ndev-01\n")]),
      },
      settings,
    )

    expect(result).toMatchObject({ ok: false, failure: { category: "unsafe-target" } })
    expect(commands).toHaveLength(3)
  })

  test("normalizes missing tools, authentication failures, and malformed JSON without exposing diagnostics", async () => {
    const missing = await readArgoFleet(
      {
        platform: "darwin",
        run: scriptedRunner([], [{ ok: false, reason: "not-found", stdout: "", stderr: "argocd missing" }]),
      },
      settings,
    )
    expect(missing).toMatchObject({ ok: false, failure: { category: "missing-cli", capability: "argocd_cli" } })
    expect(JSON.stringify(missing)).not.toContain("argocd missing")

    const auth = await readArgoFleet(
      {
        platform: "darwin",
        run: scriptedRunner(
          [],
          [
            success("argocd: v3.1.7"),
            success(help),
            success("dev\n"),
            { ok: false, reason: "failed", exitCode: 1, stdout: "", stderr: "authentication required secret" },
          ],
        ),
      },
      settings,
    )
    expect(auth).toMatchObject({ ok: false, failure: { category: "not-authenticated" } })
    expect(JSON.stringify(auth)).not.toContain("secret")

    const malformed = await readArgoFleet(
      {
        platform: "darwin",
        run: scriptedRunner([], [success("argocd: v3.1.7"), success(help), success("dev\n"), success("{")]),
      },
      settings,
    )
    expect(malformed).toMatchObject({ ok: false, failure: { category: "malformed" } })
  })

  test("does not probe unsupported platforms", async () => {
    const commands: DeploymentCommand[] = []
    const result = await readArgoFleet({ platform: "win32", run: scriptedRunner(commands, []) }, settings)
    expect(result).toMatchObject({ ok: false, failure: { category: "unsupported-platform" } })
    expect(commands).toEqual([])
  })
})

function success(stdout: string): DeploymentCommandResult {
  return { ok: true, exitCode: 0, stdout, stderr: "" }
}

function scriptedRunner(commands: DeploymentCommand[], results: DeploymentCommandResult[]): DeploymentCommandRunner {
  return async (command) => {
    commands.push(command)
    const result = results.shift()
    if (!result) throw new Error(`Unexpected command: ${command.executable}`)
    return result
  }
}
