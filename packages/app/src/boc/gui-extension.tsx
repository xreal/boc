import { Extension, Slot, type Setup } from "@opencode/gui-extensions/sdk"
import { Show } from "solid-js"
import { BocEnvironmentSessionControl } from "./environments/session"
import { BocWorktreeBaseBranch } from "./worktrees/base-branch"

const definition = Extension.define({ id: "boc-session" })

const setup: Setup<typeof definition> = (ctx) => {
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

export const bocSessionExtension = { ...definition, renderer: async () => ({ default: setup }) }
