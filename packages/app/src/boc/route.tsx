import { BocHostProvider, BocScreen, byId } from "@boc/extensions/renderer"
import { useParams } from "@solidjs/router"
import { useSettingsCommand } from "@/settings/command"
import { createBocHost } from "./host"

export function BocRouteBridge() {
  const params = useParams<{ path?: string }>()
  const host = createBocHost()
  useSettingsCommand()

  return (
    <BocHostProvider value={host}>
      <BocScreen id={firstSegment(params.path)} />
    </BocHostProvider>
  )
}

export function preloadBocRoute(pathname: string) {
  return (
    byId(firstSegment(pathname.slice("/boc/".length)))
      ?.screen()
      .then(() => undefined) ?? Promise.resolve()
  )
}

function firstSegment(path: string | undefined) {
  return path?.split("/", 1)[0] ?? ""
}
