import type { ParentProps } from "solid-js"

export function SettingsSurfaceProvider(props: ParentProps) {
  return props.children
}

export function useSettingsSurface() {
  return { replace: (_view: { type: "root"; tab: string; server: string }) => {} }
}
