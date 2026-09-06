import { BocFindBar } from "./find"
import { bocExtensions, createBocTranslator, type BocExtension } from "@boc/extensions/renderer"
import { useCommand } from "@/shell/commands/command"
import { useLayout } from "@/shell/state/layout"
import { Show } from "solid-js"
import { createBocHost } from "./host"

export function BocCommandBridge() {
  const command = useCommand()
  const layout = useLayout()
  const host = createBocHost()
  const t = createBocTranslator(host.locale)
  const extensions: readonly BocExtension[] = bocExtensions

  command.register("boc", () =>
    extensions.flatMap((extension) => [
      {
        id: `boc.${extension.id}.open`,
        title: t(extension.title),
        category: t("boc.title"),
        onSelect: () => host.navigate(`/boc/${extension.id}`),
      },
      ...(extension.commands?.map((entry) => ({
        id: entry.id,
        title: t(entry.title),
        category: t("boc.title"),
        onSelect: () => entry.run(host),
      })) ?? []),
    ]),
  )

  return (
    <Show when={layout.route().type !== "session"}>
      <BocFindBar />
    </Show>
  )
}
