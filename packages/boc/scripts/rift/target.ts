export const RIFT_TARGETS = ["darwin-arm64", "darwin-x64", "linux-x64"] as const
export type RiftTarget = (typeof RIFT_TARGETS)[number]

export function resolveRiftTarget(platform: string, arch: string): RiftTarget | undefined {
  const target = `${platform}-${arch}`
  return RIFT_TARGETS.find((supported) => supported === target)
}

export function isRiftTarget(value: string): value is RiftTarget {
  return RIFT_TARGETS.some((target) => target === value)
}
