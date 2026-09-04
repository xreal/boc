import path from "node:path"
import { app } from "electron"
import { Effect } from "effect"
import { CHANNEL } from "../main/constants"
import { DesktopPaths } from "../main/paths"
import { stageRift } from "./rift-stage"

export const resolveRiftEnvironment = Effect.gen(function* () {
  if (CHANNEL !== "boc") return undefined
  const paths = yield* DesktopPaths.resolve
  const root = path.join(app.getPath("userData"), "rift")
  const source = app.isPackaged
    ? path.join(process.resourcesPath, "rift", "rift")
    : path.join(paths.developmentResourcesRoot, "rift", "rift")
  const binary = yield* Effect.tryPromise(() => stageRift({ source, root })).pipe(
    Effect.catch((error) => Effect.logError("Rift executable staging failed", { error }).pipe(Effect.as(undefined))),
  )
  return {
    ...(binary ? { BOC_RIFT_BINARY: binary } : {}),
    BOC_RIFT_STATE_DIRECTORY: path.join(root, "state"),
  }
})
