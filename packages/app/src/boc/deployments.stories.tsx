import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { onMount } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import {
  DeploymentDialog,
  type DeploymentDialogApi,
  deploymentFailure,
  deploymentSystemFixtures,
  createFixtureDeploymentApi,
} from "@boc/extensions/deployments/preview"

type Scenario = "default" | "slow" | "retry" | "expired"

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function scenarioApi(scenario: Scenario): DeploymentDialogApi {
  const fixture = createFixtureDeploymentApi()
  if (scenario === "default") return fixture

  if (scenario === "slow") {
    return {
      ...fixture,
      prepareDeployment: async (input) => {
        await wait(2_000)
        return fixture.prepareDeployment(input)
      },
    }
  }

  if (scenario === "expired") {
    return {
      ...fixture,
      prepareDeployment: async (input) => {
        const result = await fixture.prepareDeployment(input)
        if (!result.ok) return result
        return { ...result, plan: { ...result.plan, expiresAt: new Date(0).toISOString() } }
      },
    }
  }

  let attempts = 0
  return {
    ...fixture,
    prepareDeployment: async (input) => {
      attempts += 1
      if (attempts === 1) return deploymentFailure("network")
      return fixture.prepareDeployment(input)
    },
  }
}

function DeploymentPreview(props: { kind?: "deploy" | "reset"; scenario?: Scenario; initialRef?: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const api = scenarioApi(props.scenario ?? "default")
  const system = deploymentSystemFixtures[0]
  const open = () =>
    dialog.show(() => (
      <DeploymentDialog
        api={api}
        locale={language.locale}
        system={system}
        kind={props.kind ?? "deploy"}
        initialRef={props.initialRef}
        onQueued={() => {}}
      />
    ))

  onMount(open)
  return <Button onClick={open}>Open deployment preflight</Button>
}

export default {
  title: "Boc/Deployments",
  id: "boc-deployments",
  component: DeploymentPreview,
  parameters: { layout: "fullscreen" },
}

export const Default = { args: { initialRef: "SHOP-617" } }
export const Reset = { args: { kind: "reset" } }
export const SlowPreparation = { args: { scenario: "slow" } }
export const Retry = { args: { scenario: "retry" } }
export const Expired = { args: { scenario: "expired" } }
export const NarrowRtl = {
  args: { initialRef: "SHOP-617" },
  globals: { direction: "rtl", locale: "en", theme: "dark" },
}
