import type { BocEnvironment } from "@opencode/schema/boc/environment"
import { createEffect, onCleanup, Show } from "solid-js"
import { SettingsSurfaceProvider } from "@/settings/surface"
import { Menu } from "@opencode/ui/menu"
import { environmentFixtures, type EnvironmentFixtureName } from "./fixtures"
import { createEnvironmentResource } from "./store"
import { EnvironmentControl, EnvironmentContextMenu, type EnvironmentActionTarget } from "./view"

const target = {
  server: { type: "sidecar", variant: "base", http: { url: "http://storybook.local" } },
  project: { id: "project_fixture", worktree: "/workspace", expanded: true },
  session: {
    id: "session_fixture",
    projectID: "project_fixture",
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: Date.UTC(2026, 8, 6, 9), updated: Date.UTC(2026, 8, 6, 9) },
    location: { directory: environmentFixtures.unconfigured.directory },
  },
} satisfies EnvironmentActionTarget

function activeRun(environment: BocEnvironment.State, action: BocEnvironment.Action) {
  return {
    ...environment,
    latestRun: {
      id: `run_${action}_storybook`,
      action,
      status: "running" as const,
      startedAt: Date.UTC(2026, 8, 6, 9, 30),
      log: `$ devenv ${action}\nRunning fixture action…\n`,
      truncated: false,
    },
  }
}

function EnvironmentPreview(props: {
  fixture: EnvironmentFixtureName
  enabled: boolean
  contextMenu?: boolean
  liveOutput?: boolean
}) {
  const fixture: { environment: BocEnvironment.State; timer?: ReturnType<typeof setTimeout> } = {
    environment: structuredClone(environmentFixtures[props.fixture]),
  }
  createEffect(() => {
    fixture.environment = structuredClone(environmentFixtures[props.fixture])
    if (props.liveOutput)
      fixture.environment = {
        ...fixture.environment,
        latestRun: {
          id: "live-output",
          action: "setup",
          status: "running",
          startedAt: Date.now(),
          truncated: false,
          logStart: 0,
          log:
            Array.from({ length: 80 }, (_, index) => `Build step ${index + 1}\r\n`).join("") +
            "Container shop Starting\r\n",
        },
      }
    void resource.inspect()
  })
  const resource = createEnvironmentResource({
    server: "sidecar",
    projectID: target.session.projectID,
    directory: target.session.location.directory,
    api: () => ({
      inspect: async () => {
        if (props.liveOutput && fixture.environment.latestRun) {
          fixture.environment = {
            ...fixture.environment,
            latestRun: {
              ...fixture.environment.latestRun,
              log: fixture.environment.latestRun.log + "\x1b[1A\x1b[2KContainer shop Started\r\n",
            },
          }
        }
        return structuredClone(fixture.environment)
      },
      run: async (input) => {
        if (input.action === "remove") {
          fixture.environment = structuredClone(environmentFixtures.unconfigured)
          return { accepted: true as const, environment: fixture.environment }
        }
        const container = fixture.environment.containers.items?.find((item) => item.id === input.containerID)
        fixture.environment = activeRun(fixture.environment, input.action)
        if (fixture.environment.latestRun)
          fixture.environment = {
            ...fixture.environment,
            latestRun: {
              ...fixture.environment.latestRun,
              containerID: container?.id,
              service: container?.service,
              startedAt: Date.now(),
            },
          }
        clearTimeout(fixture.timer)
        fixture.timer = setTimeout(() => {
          const run = fixture.environment.latestRun
          const items = fixture.environment.containers.items?.map((item) =>
            !input.containerID || item.id === input.containerID
              ? { ...item, state: input.action === "stop" ? ("exited" as const) : ("running" as const) }
              : item,
          )
          const running = items?.filter((item) => item.state === "running").length ?? 0
          fixture.environment = {
            ...fixture.environment,
            containers: {
              ...fixture.environment.containers,
              items,
              running,
              status: running === 0 ? "stopped" : running === items?.length ? "running" : "partial",
            },
            latestRun: run
              ? { ...run, status: "succeeded", endedAt: Date.now(), exitCode: 0, log: `${run.log}Done.\n` }
              : undefined,
          }
        }, 1500)
        return { accepted: true as const, environment: structuredClone(fixture.environment) }
      },
      cancel: async () => {
        clearTimeout(fixture.timer)
        fixture.environment = structuredClone(environmentFixtures.setupCancelled)
        return { cancelled: true, environment: fixture.environment }
      },
      logs: async () => ({
        available: true,
        text: "2026-09-10T09:30:00.000Z Listening on port 3000\n2026-09-10T09:30:01.000Z GET / 200\n",
        checkedAt: Date.now(),
      }),
      resize: async () => true,
    }),
  })
  onCleanup(resource.dispose)
  onCleanup(() => clearTimeout(fixture.timer))

  return (
    <SettingsSurfaceProvider>
      <div class="flex min-h-40 items-start justify-end bg-v2-background-bg-base p-4">
        <Show when={props.contextMenu}>
          <Menu>
            <Menu.Trigger>Session menu</Menu.Trigger>
            <Menu.Portal>
              <Menu.Content>
                <EnvironmentContextMenu
                  target={target}
                  resource={resource}
                  settingsReady={() => true}
                  enabled={() => props.enabled}
                  domain={() => "shop.localhost"}
                />
              </Menu.Content>
            </Menu.Portal>
          </Menu>
        </Show>
        <EnvironmentControl
          target={target}
          resource={resource}
          settingsReady={() => true}
          enabled={() => props.enabled}
          domain={() => "shop.localhost"}
        />
      </div>
    </SettingsSurfaceProvider>
  )
}

export default {
  title: "Boc/Development environments",
  id: "boc-development-environments",
  component: EnvironmentPreview,
  args: { fixture: "running", enabled: true },
  argTypes: {
    fixture: { control: "select", options: Object.keys(environmentFixtures) },
  },
  parameters: { layout: "fullscreen" },
}

export const Running = {}
export const LiveOutput = { args: { fixture: "running", liveOutput: true } }
export const ContextMenu = { args: { contextMenu: true } }
export const SetupRunning = { args: { fixture: "setupRunning" } }
export const SetupFailed = { args: { fixture: "setupFailed" } }
export const SetupCancelled = { args: { fixture: "setupCancelled" } }
export const Stopped = { args: { fixture: "stopped" } }
export const Partial = { args: { fixture: "partial" } }
export const InvalidAssignment = { args: { fixture: "invalidAssignment" } }
export const BackendUnavailable = { args: { fixture: "backendUnavailable" } }
export const Unconfigured = { args: { fixture: "unconfigured" } }
export const Disabled = { args: { fixture: "unconfigured", enabled: false } }
export const Narrow = {
  args: { fixture: "running" },
  globals: { viewport: { value: "mobile1", isRotated: false } },
}
