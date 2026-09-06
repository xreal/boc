import { app } from "electron"
import { Context, Effect, FileSystem, Layer, Path } from "effect"
import { connectBocService, inspectBocService } from "../../boc/background-service"
import { resolveRiftEnvironment } from "../../boc/rift"
import { CHANNEL } from "../constants"
import { BackgroundServiceState } from "./background-service-state"
import { cleanStages, DesktopCli } from "./desktop-cli"
import { SidecarCredentials } from "./sidecar-credentials"

export * as BackgroundService from "./background-service"

export interface Interface {
  readonly connection: Effect.Effect<SidecarCredentials.Data>
  readonly reconnect: Effect.Effect<SidecarCredentials.Data>
}

export class Service extends Context.Service<Service, Interface>()("opencode/desktop/BackgroundService") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const context = yield* Effect.context<FileSystem.FileSystem | Path.Path | DesktopCli.Service>()
    return Service.of(
      yield* BackgroundServiceState.make({
        initial: connect("initial").pipe(Effect.provide(context)),
        reconnect: connect("reconnect").pipe(Effect.provide(context), Effect.orDie),
      }),
    )
  }),
)

const connect = Effect.fn("BackgroundService.connect")(function* (mode: "initial" | "reconnect") {
  yield* Effect.logInfo("starting v2 background service")
  const path = yield* Path.Path
  const desktopCli = yield* DesktopCli.Service
  const runFork = Effect.runForkWith(yield* Effect.context())
  const isolated = !app.isPackaged && process.env.OPENCODE_DESKTOP_ISOLATED_SERVER === "1"
  const cli = yield* desktopCli.resolve
  const rift = yield* resolveRiftEnvironment
  const version = mode === "initial" ? cli.version : undefined
  if (isolated) process.env.XDG_STATE_HOME = app.getPath("userData")
  const client = yield* Effect.promise(() => import("@opencode-ai/client/service"))
  const options = (isolatedService: boolean) => ({
    file: serviceFile(path, isolatedService),
    version,
    command: [...cli.command, "serve", "--service", ...(isolatedService ? ["--port", "0"] : [])],
    env: {
      ...rift,
      ...(CHANNEL === "boc" && isolatedService
        ? {
            XDG_STATE_HOME: app.getPath("userData"),
            OPENCODE_DB: path.join(app.getPath("userData"), "opencode.db"),
          }
        : {}),
    },
    onStart: (reason: "missing" | "version-mismatch", previousVersion?: string) =>
      runFork(Effect.logInfo("v2 CLI background service starting", { reason, previousVersion })),
  })
  const service = yield* Effect.tryPromise(() => {
    if (CHANNEL !== "boc" || isolated) return client.Service.ensure(options(isolated))
    return connectBocService({
      version: cli.version,
      mode,
      discoverShared: () => client.Service.discover(),
      discoverIsolated: () => client.Service.discover({ file: serviceFile(path, true) }),
      inspect: (endpoint) =>
        inspectBocService(endpoint, app.getPath("home"), client.Service.headers(endpoint)),
      ensureShared: () => client.Service.ensure(options(false)),
      ensureIsolated: () => client.Service.ensure(options(true)),
      stopShared: () => client.Service.stop({ pty: "handoff" }),
    })
  })
  if (service.auth?.type !== "basic") throw new Error("V2 CLI background service did not provide authentication")
  const url = new URL(service.url)
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  yield* Effect.logInfo("v2 CLI background service ready", {
    version,
    ...endpoint(url.origin),
  })
  if (mode === "initial" && isolated && cli.binary) yield* cleanStages(cli.binary).pipe(Effect.orDie)
  const ready = { url: url.origin, password: service.auth.password } satisfies SidecarCredentials.Data
  SidecarCredentials.set(ready)
  return ready
})

function serviceFile(path: Path.Path, isolated: boolean) {
  if (CHANNEL === "boc" && isolated) return path.join(app.getPath("userData"), "opencode", "service.json")
  if (isolated && process.env.OPENCODE_DESKTOP_SERVER_CHANNEL === "local") {
    return path.join(app.getPath("userData"), "opencode", "service-local.json")
  }
  return undefined
}

function endpoint(url: string | undefined) {
  if (!url || !URL.canParse(url)) return {}
  const parsed = new URL(url)
  return { url, hostname: parsed.hostname, port: parsed.port }
}
