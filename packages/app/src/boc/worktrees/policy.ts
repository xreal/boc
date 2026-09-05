import { createBocTranslator, useBocDesktop, type BocTranslator } from "@boc/extensions/renderer"
import type { ServerBocWorktreeRiftCapabilityOutput } from "@opencode-ai/client/promise"
import { Project } from "@opencode-ai/schema/project"
import { useLanguage } from "@/runtime/i18n/language"
import { useServer } from "@/runtime/server/current"
import { showToast } from "@/shell/notifications/toast"
import type { WorktreeStrategyResolver } from "@/workspaces/create"

export type WorktreeBackend = "git" | "rift"
export type WorktreeProjectBackend = WorktreeBackend | "inherit"
export type RiftCapability = ServerBocWorktreeRiftCapabilityOutput

export function useBocWorktreeStrategy(): WorktreeStrategyResolver {
  const desktop = useBocDesktop()
  const server = useServer()
  const language = useLanguage()
  const t = createBocTranslator(language.locale)

  return async (input) => {
    if (!desktop) return

    const scope = { server: server.key, projectID: Project.ID.make(input.project.id) }
    const [defaults, project] = await Promise.all([
      desktop.worktrees.getDefault(),
      desktop.worktrees.getProject(scope),
    ]).catch(() => [])
    const backend = project?.backend ?? defaults?.defaultBackend ?? "git"
    if (backend !== "rift") return

    if (!server.isLocal) {
      showFallback(t, t("boc.worktrees.method.localOnly"))
      return
    }

    const capability = await input.api["server.boc.worktree"].riftCapability({
      projectID: input.project.id,
      source: input.project.canonical,
      directory: input.directory,
    }).catch(() => undefined)

    if (capability?.available) return "boc/rift"

    showFallback(t, capabilityReason(t, capability?.reason ?? "backend-unavailable"))
  }
}

function showFallback(t: BocTranslator, reason: string) {
  showToast({
    title: t("boc.worktrees.fallback.title"),
    description: t("boc.worktrees.fallback.description", { reason }),
  })
}

export function capabilityReason(
  t: BocTranslator,
  reason: Exclude<RiftCapability, { available: true }>["reason"],
) {
  return t(`boc.worktrees.method.unavailable.${reason}`)
}

export function backendName(t: BocTranslator, backend: WorktreeBackend) {
  return t(backend === "rift" ? "boc.worktrees.method.rift" : "boc.worktrees.method.git")
}
