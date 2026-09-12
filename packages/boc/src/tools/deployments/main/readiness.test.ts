import { describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  autoSyncCapability,
  createDeploymentReadiness,
  findInstalledDevenvRoot,
  platformCapability,
  validateDeploymentSettings,
} from "./readiness"

describe("deployment readiness", () => {
  test("supports native macOS and Linux only", () => {
    expect(platformCapability("darwin").status).toBe("available")
    expect(platformCapability("linux").status).toBe("available")
    expect(platformCapability("win32")).toMatchObject({ status: "unavailable", failure: "unsupported-platform" })
  })

  test("blocks empty selectors, relative paths, and staging or production filters", () => {
    expect(
      validateDeploymentSettings({
        applicationLabelKey: " ",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
    ).toMatchObject({ category: "invalid-input", context: { field: "argoFilter" } })
    expect(
      validateDeploymentSettings({
        applicationLabelKey: "app",
        applicationLabelValue: " ",
        notificationsEnabled: true,
      }),
    ).toMatchObject({ category: "invalid-input", context: { field: "argoFilter" } })
    expect(
      validateDeploymentSettings({
        devenvPath: "relative/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
    ).toMatchObject({ category: "invalid-input" })
    expect(
      validateDeploymentSettings({
        argoProject: "shop-production",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
    ).toMatchObject({ category: "unsafe-target" })
  })

  test("finds the current bf-deploy location before the legacy location", async () => {
    const status = await autoSyncCapability(
      {
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      },
      async (file) => file.includes("/src/platform/tools/bf-deploy/"),
      async () => "/work/devenv",
    )
    expect(status.status).toBe("available")
  })

  test("discovers the checkout root from the installed devenv command without executing it", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "boc-devenv-discovery-"))
    const root = path.join(temporary, "checkout")
    const bin = path.join(temporary, "bin")
    const executable = path.join(root, "devenv.sh")
    await Promise.all([mkdir(root), mkdir(bin)])
    await Bun.write(executable, "#!/bin/sh\n")
    await chmod(executable, 0o755)
    await symlink(executable, path.join(bin, "devenv"))

    try {
      expect(await findInstalledDevenvRoot({ PATH: bin })).toBe(await realpath(root))
    } finally {
      await rm(temporary, { recursive: true })
    }
  })

  test("keeps optional discovery failures from blocking deployment readiness", async () => {
    const status = await autoSyncCapability(
      {
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      },
      async () => true,
      async () => {
        throw new Error("PATH unavailable")
      },
    )

    expect(status).toMatchObject({ status: "unavailable", failure: "invalid-input" })
  })

  test("keeps supporting the legacy bf-deploy location", async () => {
    const status = await autoSyncCapability(
      {
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      },
      async (file) => file.includes("/src/tools/bf-deploy/"),
    )
    expect(status.status).toBe("available")
  })

  test("requires both reviewed bf-deploy files without changing fleet readiness", async () => {
    const checked: string[] = []
    const status = await autoSyncCapability(
      {
        devenvPath: "/work/devenv",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      },
      async (file) => {
        checked.push(file)
        return !file.endsWith("src/bf_deploy.py")
      },
    )
    expect(checked).toEqual([
      "/work/devenv/src/platform/tools/bf-deploy/__main__.py",
      "/work/devenv/src/platform/tools/bf-deploy/src/bf_deploy.py",
      "/work/devenv/src/tools/bf-deploy/__main__.py",
      "/work/devenv/src/tools/bf-deploy/src/bf_deploy.py",
    ])
    expect(status).toMatchObject({ status: "unavailable", failure: "not-found" })

    const readiness = createDeploymentReadiness({
      platform_supported: { status: "available" },
      argocd_cli: { status: "available" },
      dev_target_verified: { status: "available" },
      argocd_auth: { status: "available" },
      argocd_list_applications: { status: "available" },
      deployment_settings: { status: "available" },
      bf_deploy_auto_sync: { status: "unavailable", failure: "not-found" },
    })
    expect(readiness.fleetReady).toBe(true)
  })
})
