import { Icon } from "@opencode/ui/icon"
import { Menu } from "@opencode/ui/menu"
import type { ParentProps } from "solid-js"
import type { BocTranslator } from "../../../renderer/i18n"

export default function JiraIssueCardMenu(
  props: ParentProps<{
    t: BocTranslator
    indented: boolean
    disabled?: boolean
    onNewChat: () => Promise<void>
    onStartWork: () => Promise<void>
  }>,
) {
  return (
    <Menu.Context gutter={4}>
      <Menu.Context.Trigger as="div" classList={{ "ps-2": props.indented }}>
        {props.children}
      </Menu.Context.Trigger>
      <Menu.Context.Portal>
        <Menu.Context.Content class="min-w-48">
          <Menu.Item disabled={props.disabled} onSelect={() => void props.onNewChat()}>
            <Icon name="speech-bubble" size="small" />
            {props.t("boc.jira.sessions.new")}
          </Menu.Item>
          <Menu.Item disabled={props.disabled} onSelect={() => void props.onStartWork()}>
            <Icon name="sparkles" size="small" />
            {props.t("boc.jira.sessions.start")}
          </Menu.Item>
        </Menu.Context.Content>
      </Menu.Context.Portal>
    </Menu.Context>
  )
}
