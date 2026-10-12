import { app } from "electron"
import { Context, Effect, FileSystem, Layer, Path } from "effect"
import { bocServicePlacement, connectBocService, inspectBocService } from "../../boc/background-service"
import { bocServiceFile, isBocSourceBackend } from "../../boc/development"
import { CHANNEL } from "../constants"
import { BackgroundServiceState } from "./background-service-state"
import { cleanStages } from "./cli-stages"
import { DesktopCli } from "./desktop-cli"
import { SidecarCredentials } from "./sidecar-credentials"
import { sidecarProbe } from "./sidecar-probe"

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
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const desktopCli = yield* DesktopCli.Service
  const runFork = Effect.runForkWith(yield* Effect.context<FileSystem.FileSystem | Path.Path>())
  const isolated = !app.isPackaged && process.env.OPENCODE_DESKTOP_ISOLATED_SERVER === "1"
  const cli = yield* desktopCli.resolve
  const development = isBocSourceBackend(CHANNEL)
  const boc = CHANNEL === "boc" || development
  const bocDatabase = path.join(app.getPath("userData"), "opencode.db")
  const hasIsolatedDatabase = boc ? yield* fs.exists(bocDatabase) : false
  const placement = bocServicePlacement({
    forcedIsolated: isolated,
    packaged: app.isPackaged,
    hasIsolatedDatabase,
  })
  const version = mode === "initial" ? cli.version : undefined

  if (isolated) process.env.XDG_STATE_HOME = app.getPath("userData")
  const client = yield* Effect.promise(() => import("@opencode/client/service"))
  const options = (isolatedService: boolean) => ({
    file: serviceFile(path, isolatedService),
    version,
    // A fixed port lets competing starters back off instead of sharing one database.
    command: [
      ...cli.command,
      "serve",
      "--service",
      ...(isolatedService ? ["--hostname", "0.0.0.0", "--port", String(0x0c0c)] : []),
    ],
    env: {
      ...(boc && isolatedService
        ? {
            XDG_STATE_HOME: app.getPath("userData"),
            OPENCODE_DB: development ? (process.env.OPENCODE_DB ?? "opencode-local.db") : bocDatabase,
          }
        : {}),
    },
    onStart: (reason: "missing" | "version-mismatch", previousVersion?: string) =>
      runFork(Effect.logInfo("v2 CLI background service starting", { reason, previousVersion })),
  })
  const ensureShared = () => client.Service.ensure(options(false))
  const ensureIsolated = () => client.Service.ensure(options(true))
  const early = mode === "initial" && placement === "shared" ? yield* Effect.promise(sidecarProbe) : undefined
  const service = yield* Effect.tryPromise(async () => {
    if (!boc) {
      const ensure = placement === "isolated" ? ensureIsolated : ensureShared
      if (!early) return ensure()
      void ensure().catch(() => undefined)
      return early
    }

    const connected = await connectBocService({
      version: cli.version,
      mode,
      placement,
      discoverShared: () => (early ? Promise.resolve(early) : client.Service.discover()),
      discoverIsolated: () => client.Service.discover({ file: serviceFile(path, true) }),
      inspect: (endpoint) => inspectBocService(endpoint, app.getPath("home"), client.Service.headers(endpoint)),
      ensureShared,
      ensureIsolated,
      stopShared: () => client.Service.stop({ pty: "handoff" }),
      stopIsolated: () => client.Service.stop({ file: serviceFile(path, true), pty: "handoff" }),
      resetShared: () => client.Service.stop({ pty: "clear" }),
      resetIsolated: () => client.Service.stop({ file: serviceFile(path, true), pty: "clear" }),
    })
    if (connected === early) void ensureShared().catch(() => undefined)
    return connected
  })
  if (service.auth?.type !== "basic") throw new Error("V2 CLI background service did not provide authentication")
  const url = new URL(service.url)

  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1"
  yield* Effect.logInfo("v2 CLI background service ready", {
    version,
    placement,
    probed: service === early,
    ...endpoint(url.origin),
  })

  // Only packaged and isolated builds run a staged copy; any other binary sits in the source tree.
  // The service now runs the current version, so an older copy at most belongs to a process still exiting.
  if (mode === "initial" && (app.isPackaged || isolated) && cli.binary)
    runFork(
      cleanStages(cli.binary).pipe(
        Effect.catch((error) => Effect.logError("failed to clean staged v2 CLIs", { error })),
      ),
    )
  const ready = { url: url.origin, password: service.auth.password } satisfies SidecarCredentials.Data
  SidecarCredentials.set(ready)

  return ready
})

function serviceFile(path: Path.Path, isolated: boolean) {
  const boc = isolated ? bocServiceFile(CHANNEL, app.getPath("userData")) : undefined
  if (boc) return boc
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
