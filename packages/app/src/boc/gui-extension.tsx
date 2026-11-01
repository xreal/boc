import { Plugin, Slot } from "@opencode/plugin/gui"
import { Show } from "solid-js"
import { BocEnvironmentSessionControl } from "./environments/session"
import { BocWorktreeBaseBranch } from "./worktrees/base-branch"

const definition = Plugin.define({})

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  ctx.add(Slot, {
    at: "session.header",
    order: 30,
    render: (input) => (
      <Show when={!ctx.layout.narrow()}>
        <BocWorktreeBaseBranch sessionID={input.session.id} />
        <Show when={!ctx.layout.side.opened(input.session)}>
          <BocEnvironmentSessionControl sessionID={input.session.id} />
        </Show>
      </Show>
    ),
  })
  ctx.add(Slot, {
    at: "session.panel.end",
    render: (input) => <BocEnvironmentSessionControl sessionID={input.session.id} compact />,
  })
}

export const bocSessionPlugin = { ...definition, id: "boc-session", windowEntry: async () => ({ default: setup }) }
