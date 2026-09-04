import { Schema } from "effect"

export const RIFT_BACKEND_VERSION = "0.0.10"

export const RiftCapabilityReason = Schema.Literals([
  "backend-unavailable",
  "binary-missing",
  "binary-unhealthy",
  "project-mismatch",
  "storage-inaccessible",
  "unsupported-architecture",
  "unsupported-filesystem",
  "unsupported-platform",
])
export type RiftCapabilityReason = typeof RiftCapabilityReason.Type

export const RiftCapability = Schema.Union([
  Schema.Struct({
    available: Schema.Literal(true),
    backend: Schema.Literal("boc/rift"),
    version: Schema.Literal(RIFT_BACKEND_VERSION),
    filesystem: Schema.String,
  }),
  Schema.Struct({
    available: Schema.Literal(false),
    backend: Schema.Literal("boc/rift"),
    version: Schema.Literal(RIFT_BACKEND_VERSION),
    reason: RiftCapabilityReason,
    message: Schema.String,
  }),
])
export type RiftCapability = typeof RiftCapability.Type
