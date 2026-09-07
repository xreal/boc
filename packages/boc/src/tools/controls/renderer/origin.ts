export function controlOrigin(source: string, directories: { project: string[]; global: string[] }) {
  const normalized = source.replaceAll("\\", "/")
  const within = (root: string) => {
    const path = root.replaceAll("\\", "/").replace(/\/+$/, "")
    return !!path && (normalized === path || normalized.startsWith(`${path}/`))
  }
  if (within("/builtin")) return "system"
  if (directories.global.some(within)) return "global"
  if (directories.project.some(within)) return "project"
  // Registry/configuration labels describe the API, not an item's provenance.
  return "plugin"
}
