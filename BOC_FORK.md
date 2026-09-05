# Boc fork integration map

This is the operational map of Boc's deliberate differences from `upstream/beta`. It is not a changelog or roadmap. Read it before changing a fork integration or merging upstream.

## Maintenance contract

- Update this file in the same commit that adds, changes, replaces, or removes a fork capability, upstream seam, or upstream API dependency.
- Describe only implemented behavior. Plans and experiments become entries when their code lands.
- Keep product code in fork-owned paths. If an upstream-owned file must change, keep the change narrow and record it here and in `packages/boc/fork-surface.json`.
- Prefer a supported upstream extension point over a Boc workaround. Remove obsolete seams when upstream makes them unnecessary.
- Treat `packages/boc/fork-surface.json` as the exact machine-readable path list and this file as the explanation of intent and coupling.

## Implemented capabilities

| Area | Boc behavior | Primary fork-owned code |
| --- | --- | --- |
| Product identity | `boc` release channel, `Boc Beta` app identity, separate application data/service identity, Boc icons, and updates from `BergDevOrg/boc`. | `packages/desktop/icons/boc/`, `packages/desktop/src/boc/` |
| Extension shell | Compile-time registry for lazy screens, navigation, commands, Boc-owned i18n, host capabilities, and typed desktop RPC composition. New tools normally register without another upstream shell edit. | `packages/boc/src/registry.ts`, `packages/boc/src/renderer/`, `packages/app/src/boc/`, `packages/desktop/src/boc/provider.tsx` |
| Jira board | Desktop-only Jira Cloud connection, encrypted token storage, read-only boards/sprints/issues, search and filters, saved preferences, cancellation, bounded rate-limit retries, issue inspection, card hover feedback, and ticket prompts with optional instructions opened in the normal session composer. Session links persist locally in the main-owned Jira store by issue URL, draft ID, server key, and session ID, survive disconnects, and become visible after successful creation. | `packages/boc/src/tools/jira/` |
| Deployments | Desktop view of development systems and operations through GitHub and Argo CD CLIs, readiness checks, saved settings, prepared deploy/reset dispatch, redeploy, and auto-sync controls. | `packages/boc/src/tools/deployments/` |
| Rift checkouts | Optional Rift-backed checkout lifecycle, bundled runtime staging, global/project selection, capability API, ownership metadata, trash inspection, and cleanup. Git remains the fallback. | `packages/boc/src/worktrees/`, `packages/app/src/boc/worktrees/`, `packages/desktop/src/boc/rift*`, `packages/schema/src/boc/`, `packages/protocol/src/boc/`, `packages/server/src/boc/` |

## Upstream integration surface

The exact approved files and reasons live in `packages/boc/fork-surface.json`. These groups explain what must survive an upstream merge.

| Surface | Upstream-owned files | Nature of the Boc change |
| --- | --- | --- |
| App shell | `packages/app/package.json`, `src/shell/routes/routes.tsx`, `src/shell/state/layout.tsx`, `src/shell/titlebar/titlebar.tsx`, `src/runtime/i18n/en.ts`, `vite.js`, `src/env.d.ts` | Add the generic Boc route/command/navigation bridges and recognize the `boc` channel. Product-specific behavior stays in fork-owned bridges. |
| Checkout UX and behavior | `packages/app/src/workspaces/create.ts`, its test, new-session composer/view/workspace files, session workspace menu, general/project/workspace settings | Inject the optional checkout strategy, display the effective backend, store preferences, and expose Rift cleanup. This is the largest app behavior seam and needs semantic review after workspace changes. |
| Session creation | `packages/app/src/new-session/composer-adapter.ts` | Notify the fork-owned session-link bridge after the server confirms creation; preserve the existing composer and submission flow. |
| UI source discovery | `packages/ui/src/styles/tailwind/index.css` | Include Boc renderer sources in Tailwind scanning; no Boc component implementation belongs here. |
| Desktop identity and packaging | `packages/desktop/electron-builder.config*`, `electron.vite.config.ts`, build scripts, `.gitignore`, `src/main/constants.ts`, `src/main/lifecycle/environment.ts` | Select channel-specific identity, metadata, icons, update source, environment, and staged Rift artifact. |
| Desktop process composition | `packages/desktop/package.json`, `src/shared/ipc-rpc.ts`, `src/main/ipc.ts`, `src/renderer/desktop-app.tsx`, `src/main/service/background-service.ts` | Merge typed Boc RPCs/handlers, mount the renderer provider, and launch the Boc backend with its isolated service/runtime configuration. |
| Server and public API | `packages/server/package.json`, `src/routes.ts`, `src/handlers.ts`, `packages/protocol/src/api.ts`, generated files under `packages/client/` | Register Boc worktree services and authenticated HTTP capability endpoints, then expose the generated typed clients. Generated clients are never edited by hand. |
| Repository metadata | `AGENTS.md`, `bun.lock`, `.github/workflows/boc-audit.yml` | Preserve fork policy, dependencies, and automated surface enforcement. |

No upstream component is intentionally copied into Boc. When a conflict tempts a copy, first look for a bridge, registry, Effect `Layer`, plugin, RPC group, or channel branch.

## Upstream APIs Boc relies on

| API or contract | Boc use | Watch for |
| --- | --- | --- |
| `@opencode-ai/core/worktree` (`Worktree.Strategy`, strategy IDs and registration/composition) | Implements and selects `boc/rift`. | Strategy input/output changes, selection semantics, plugin registration, worktree persistence, removal safety. |
| `@opencode-ai/core/git`, core application/service nodes, and `@opencode-ai/plugin/effect/plugin` | Builds the Rift backend and composes it into the server host. | Service graph or `LayerNode` changes, plugin context changes, Git repository helpers, location scoping. |
| Effect `HttpApiGroup`/`HttpApiBuilder` and `RpcGroup` | Boc server capability endpoints and desktop IPC. | Group merge signatures, handler environment requirements, schema or error-channel changes. |
| Generated `@opencode-ai/client` Promise/Effect clients | App-side Rift capability and cleanup calls. | Operation identifiers, generated method names, request shape changes; regenerate from `packages/client` after public API changes. |
| App routing, command, language, platform, server, dialog, workspace, and tab hooks | Fork-owned bridges adapt Boc features to the app shell. | Context/provider placement, route parsing, command registration lifecycle, workspace creation/cache semantics, draft creation, and session tab selection. |
| Desktop `DesktopRpcs`, handler layers, renderer `invoke`, `DesktopPaths`, `CHANNEL`, and background-service startup | Connects Boc renderer/main code and stages Rift for the Boc backend. | IPC client typing, provider order, dependency externalization, service environment and lifecycle changes. |
| `@opencode-ai/ui` component exports and semantic tokens | Jira, deployments, navigation, and settings UI. | Renamed exports, portal/focus behavior, token changes, Tailwind source discovery. |

Imports from `effect/unstable/*` and internal app/desktop modules are deliberate but high-coupling dependencies. Prefer stable public replacements when upstream introduces them.

## Merge risk order

1. Inspect every incoming commit and changed file in `packages/core`, `packages/app`, and `packages/desktop`; commit scopes such as `fix(core):`, `fix(app):`, and `fix(desktop):` are priority signals, not the only filter.
2. Review `packages/protocol`, `packages/schema`, `packages/server`, `packages/client`, and `packages/ui` when they touch an API or seam listed above.
3. TUI-only changes are normally low priority. Raise them when they also change shared core, protocol, schema, client, UI, or server behavior.
4. A clean textual merge is not proof of compatibility. Check renamed APIs, changed defaults, new native extension points, provider order, generated clients, and build-time behavior.

## Required verification

Run checks from their package directories; never run tests from the repository root.

```text
packages/boc:     bun typecheck && bun test
packages/app:     bun typecheck && bun test --conditions=solid --preload ./happydom.ts src/boc
packages/desktop: bun typecheck && bun test
repo root:        bun packages/boc/scripts/audit-fork-surface.ts
```

Also run `bun run generate` from `packages/client` after public Protocol or Server `HttpApi` changes. Build app/desktop when routing, channel identity, bundling, lazy loading, IPC, or packaged resources change. Run focused core/server/client checks when their APIs are involved.
