import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { useCommand } from "@/shell/commands/command"
import { useLanguage } from "@/runtime/i18n/language"
import { showToast } from "@/shell/notifications/toast"

// Boc fork entry point. Upstream owns the titlebar layout; boc only
// contributes this button plus the `boc.open` command it triggers.
export function BocNavButton(props: { orientation: "horizontal" | "vertical" }) {
  const language = useLanguage()
  const command = useCommand()

  const open = () =>
    showToast({ title: language.t("boc.title"), description: language.t("boc.opened.description") })

  command.register("boc", () => [
    {
      id: "boc.open",
      title: language.t("boc.title"),
      category: language.t("command.category.view"),
      onSelect: open,
    },
  ])

  if (props.orientation === "vertical") {
    return (
      <button
        type="button"
        data-action="vertical-tabs-boc"
        class="group flex h-7 w-full shrink-0 items-center gap-1.5 rounded-[6px] ps-1.5 pe-2 text-[13px] leading-4 text-v2-text-text-faint hover:bg-v2-background-bg-layer-02 hover:text-v2-text-text-base"
        onClick={open}
        aria-label={language.t("boc.title")}
      >
        <Icon name="status" />
        <span class="min-w-0 truncate">{language.t("boc.title")}</span>
      </button>
    )
  }

  return (
    <Tooltip placement="bottom" value={language.t("boc.title")} class="shrink-0">
      <IconButton
        type="button"
        variant="ghost-muted"
        size="large"
        class="!w-9 shrink-0"
        icon={<Icon name="status" />}
        onClick={open}
        aria-label={language.t("boc.title")}
      />
    </Tooltip>
  )
}
