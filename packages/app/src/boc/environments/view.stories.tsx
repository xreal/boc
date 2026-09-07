import type { BocEnvironmentState } from "@opencode-ai/client/promise"
import { onCleanup, Show } from "solid-js"
import { Menu } from "@opencode-ai/ui/menu"
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

function activeRun(environment: BocEnvironmentState, action: "setup" | "start" | "stop" | "remove") {
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

function EnvironmentPreview(props: { fixture: EnvironmentFixtureName; enabled: boolean; contextMenu?: boolean }) {
  const resource = createEnvironmentResource({
    server: "sidecar",
    projectID: target.session.projectID,
    directory: target.session.location.directory,
    api: () => ({
      inspect: async () => environmentFixtures[props.fixture],
      run: async (input) => ({
        accepted: true as const,
        environment:
          input.action === "remove"
            ? environmentFixtures.unconfigured
            : activeRun(environmentFixtures[props.fixture], input.action),
      }),
      cancel: async () => ({ cancelled: true, environment: environmentFixtures.setupCancelled }),
    }),
  })
  void resource.inspect()
  onCleanup(resource.dispose)

  return (
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
