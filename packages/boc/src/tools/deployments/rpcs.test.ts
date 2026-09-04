import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import {
  DeploymentAutoSyncInput,
  DeploymentDraft,
  DeploymentRpcs,
  DeploymentSettings,
  DeploymentSystemsReadInput,
} from "./rpcs"

const deploymentTags = [
  "BocDeploymentsGetWorkspace",
  "BocDeploymentsListSystems",
  "BocDeploymentsCancelSystemsRead",
  "BocDeploymentsGetSettings",
  "BocDeploymentsSaveSettings",
  "BocDeploymentsCheckReadiness",
  "BocDeploymentsListBranches",
  "BocDeploymentsListWorkflowTargets",
  "BocDeploymentsListOperations",
  "BocDeploymentsPrepareDeployment",
  "BocDeploymentsDispatchPrepared",
  "BocDeploymentsPrepareReset",
  "BocDeploymentsDispatchPreparedReset",
  "BocDeploymentsRedeployBranch",
  "BocDeploymentsSetAutoSync",
] as const

describe("Deployment RPC contracts", () => {
  test("uses explicit operation-prefixed RPC tags", () => {
    expect([...DeploymentRpcs.requests.keys()]).toEqual([...deploymentTags])
  })

  test("decodes bounded reads and non-secret settings", () => {
    expect(Schema.decodeUnknownSync(DeploymentSystemsReadInput)({ requestId: "fleet-1", refresh: true })).toEqual({
      requestId: "fleet-1",
      refresh: true,
    })
    expect(
      Schema.decodeUnknownSync(DeploymentSettings)({
        devenvPath: "/work/devenv",
        argoProject: "shop-dev",
        applicationLabelKey: "app",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
        githubToken: "never-keep-this",
      }),
    ).toEqual({
      devenvPath: "/work/devenv",
      argoProject: "shop-dev",
      applicationLabelKey: "app",
      applicationLabelValue: "shop",
      notificationsEnabled: true,
    })
    expect(JSON.stringify(DeploymentSettings.ast)).not.toMatch(/token|secret|authorization/i)
  })

  test("rejects unsafe deployment targets and workflow names", () => {
    for (const environment of ["dev-02", "17", "stage", "prod", "../01"]) {
      expect(() =>
        Schema.decodeUnknownSync(DeploymentDraft)({
          environment,
          ref: "SHOP-123-checkout",
          workflows: [{ filename: "app-shop.yml", inputs: { perform_tests: true } }],
        }),
      ).toThrow()
    }
    expect(() =>
      Schema.decodeUnknownSync(DeploymentDraft)({
        environment: "02",
        ref: "SHOP-123-checkout",
        workflows: [{ filename: "../app-shop.yml", inputs: {} }],
      }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(DeploymentDraft)({ environment: "02", ref: "SHOP-123-checkout", workflows: [] }),
    ).toThrow()
    expect(() =>
      Schema.decodeUnknownSync(DeploymentSettings)({
        applicationLabelKey: "app=shop,environment",
        applicationLabelValue: "shop",
        notificationsEnabled: true,
      }),
    ).toThrow()
  })

  test("requires an explicit confirmation and expected state for auto-sync", () => {
    expect(
      Schema.decodeUnknownSync(DeploymentAutoSyncInput)({
        environment: "02",
        expected: "no-prune",
        enabled: true,
        confirmed: true,
      }),
    ).toEqual({ environment: "02", expected: "no-prune", enabled: true, confirmed: true })
    expect(() =>
      Schema.decodeUnknownSync(DeploymentAutoSyncInput)({
        environment: "02",
        expected: "off",
        enabled: true,
        confirmed: false,
      }),
    ).toThrow()
  })
})
