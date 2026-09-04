# BOC Extensions and Jira Board Integration Plan

Status: architecture v2, reviewed against the code on `boc-beta` (merge-base `c9d2407` with `upstream/beta`). No implementation has started.

Companion document: `BOC_HANDOVER.md` is the living status log and holds the paste-ready start prompt for the next agent session. This file is the stable specification. Agents change this file only in the places Section 21 allows.

## 0. Revision notes (v1 -> v2)

What changed after checking the draft against the actual code, and why:

- Upstream touch budget shrinks from 13 files to 7 new touches. `app.tsx`, `renderer/api.ts`, `renderer/api-types.ts`, `settings/shell.tsx` and the upstream layout test file are no longer touched (Section 10 explains each).
- Route identity is derived from the extension id (`/boc/<id>`); there is no separate `route.path` in the contract.
- `LayoutRoute` gains `{ type: "boc"; id: string }` (not `path`), so navigation active state is one comparison.
- The command bridge mounts in `routes.tsx` `AppLayout`, which is always mounted below `CommandProvider`. It works on web and desktop and needs no extra mount point.
- The desktop bridge lives in fork-owned `packages/desktop/src/boc/` and reuses the existing typed `invoke` from `renderer/ipc-client.ts`. No handwritten API mappings in upstream files.
- The two BOC strings in upstream `en.ts` (`boc.title`, `boc.opened.description`) move into the BOC package; only the channel identity string `titlebar.channel.boc` stays.
- The upstream `layout.test.ts` is not touched; BOC route parsing is tested from a fork-owned test file.
- Registry uniqueness is enforced by a unit test, not runtime code.
- A test-only second extension fixture proves multi-extension composition without shipping a fake tool.
- Jira state (connection metadata, saved boards, preferences) has one owner: the Electron main BOC store, reached through typed RPCs. No host storage capability is needed.
- Delivery is organized as four agent sessions with explicit exit criteria and a handover protocol (Sections 16 and 21).
- Known gotchas an agent would otherwise rediscover are listed in Section 12.

## 1. Objective

Add a Jira Board to BOC in a way that:

- feels native to the OpenCode desktop UI rather than like an embedded copy of Emdash;
- keeps the permanent diff against `upstream/beta` small and additive;
- creates reusable integration seams for two or three more BOC tools;
- keeps feature code, tests, translations, Jira networking and credentials in fork-owned locations;
- preserves type-safe boundaries between the renderer and Electron main;
- allows upstream merges without re-editing route, titlebar or IPC infrastructure for each new tool.

The target is not zero merge conflicts. The target is a tiny, stable set of registration points that rarely need manual reconciliation.

## 2. Core decision

Create a compile-time BOC extension system in a new workspace package:

```text
packages/boc/                 package: @boc/extensions
```

This is "plugin-like" but not a runtime plugin loader.

- Extensions are imported through one typed registry at build time.
- Jira and future tools register a screen, a navigation entry, commands and optional desktop RPCs through that registry.
- OpenCode app and desktop code connect to the registry once through generic BOC slots.
- Adding another tool normally changes only `packages/boc/`.

Why static composition: end-to-end TypeScript and Effect RPC schemas, normal tree shaking and lazy screen loading, no untrusted code execution, no manifest/lifecycle/dependency resolver, and build-time failures instead of runtime failures. Dynamic external plugins are out of scope.

## 3. Non-negotiable architecture rules

1. Fork-owned implementation lives under `packages/boc/`, `packages/app/src/boc/` and `packages/desktop/src/boc/`.
2. Upstream files receive additive-only imports, mounts, route cases or merge arguments. Existing OpenCode behavior is not rewritten.
3. Dependency direction is one way:

   ```text
   @opencode-ai/app     -> @boc/extensions
   @opencode-ai/desktop -> @boc/extensions
   ```

   `@boc/extensions` never imports from `@opencode-ai/app` or `@opencode-ai/desktop`. It may depend on `@opencode-ai/ui`, `effect`, `solid-js`, `@solidjs/router` types and `@solid-primitives/i18n`. Fork-owned bridge files inside app/desktop may import upstream internals; that is their job.

4. Product names such as `jira` never appear in upstream-owned files. Upstream files know only generic BOC routes, slots, RPC groups and providers.
5. Renderer code never receives or persists Jira credentials. Authenticated Jira requests run in Electron main.
6. IPC stays schema-validated and operation-specific. No generic `invoke(tool, operation, payload)` escape hatch.
7. User-visible text is resolved by a BOC-owned typed i18n layer. BOC strings do not go into upstream locale files.
8. Every permanent upstream touch is listed in the fork-surface allowlist and checked by the audit script.
9. `@boc/extensions` subpath exports separate browser-safe code from Electron-main code. Renderer entry points never import `electron`.

## 4. Proposed shape

```text
OpenCode app shell (upstream)              fork-owned bridges              @boc/extensions
------------------------------------      --------------------------      -------------------------------
titlebar.tsx  --mounts-->                 app/src/boc/navigation.tsx  ->  registry + host contract
routes.tsx    --/boc/*path-->             app/src/boc/route.tsx       ->  screen resolver (lazy per tool)
routes.tsx    --AppLayout child-->        app/src/boc/commands.tsx    ->  command definitions
layout.tsx    --{type:"boc"}-->           (no bridge, generic case)
desktop-app.tsx --wraps-->                desktop/src/boc/provider.tsx -> BocDesktopProvider(createBocDesktopAPI(invoke))
ipc-rpc.ts    --merge-->                  (none)                       -> BocDesktopRpcs
ipc.ts        --Layer.mergeAll-->         (none)                       -> bocDesktopHandlers, bocDesktopServices
                                                                              |
                                                                       tools/jira, tools/<next>
                                                                              |
                                                                       Electron main -> Jira Cloud API
```

## 5. Package layout

```text
packages/boc/
  package.json                @boc/extensions; exports: ./renderer, ./desktop/shared, ./desktop/main, ./desktop/renderer
  tsconfig.json
  happydom.ts                 test preload (copy of packages/app/happydom.ts)
  fork-surface.json           allowlist for the audit (Section 11)
  scripts/audit-fork-surface.ts
  src/
    registry.ts               bocExtensions, byId(), types
    renderer/
      host.tsx                BocHost type, BocHostProvider, useBocHost
      desktop.tsx             BocDesktopProvider, useBocDesktop (undefined on web)
      screen.tsx              BocScreen: resolves id -> lazy tool screen | not-found | desktop-required
      i18n.ts                 English dictionary composition + createBocTranslator
    desktop/
      shared/rpcs.ts          BocDesktopRpcs = merged tool RPC groups
      main/index.ts           bocDesktopHandlers, bocDesktopServices
      renderer/api.ts         createBocDesktopAPI(invoke)
    tools/
      jira/
        extension.tsx         id, title key, icon, lazy screen, commands
        i18n/en.ts
        rpcs.ts               shared Effect Schemas and RpcGroup
        domain/               pure: board config -> columns, grouping, filters, pagination helpers
        main/                 client.ts, credentials.ts, store.ts, handlers.ts
        renderer/             screen, toolbar, board, card, inspector, settings dialog
        fixtures/
      __fixtures__/example/   test-only second extension used by registry/composition tests
```

Do not create files merely to match this diagram. The boundaries that matter: runtime-neutral definitions, browser-safe renderer code, Electron-main-only code, one self-contained folder per tool.

## 6. Extension contract

Keep it small and capability-based. Conceptual shape:

```ts
type BocExtension = {
  id: string                                    // URL segment: /boc/<id>; also nav/command namespace
  title: BocI18nKey                             // nav label and command title
  icon: IconName                                // @opencode-ai/ui icon name
  screen: () => Promise<{ default: Component<BocScreenProps> }>   // lazy; also serves as preload
  commands?: readonly { id: `boc.${string}`; title: BocI18nKey; run: (host: BocHost) => void }[]
  desktopOnly?: boolean                         // renders desktop-required state on web
}
```

Sub-paths (`/boc/jira/boards/42`) are handled inside the tool screen through `host.location()`; the registry only resolves the first segment.

Desktop RPCs and handlers compose through separate static exports because they run in different processes:

```ts
// src/registry.ts
export const bocExtensions = [jiraExtension] as const
// src/desktop/shared/rpcs.ts
export const BocDesktopRpcs = JiraRpcs
// src/desktop/main/index.ts
export const bocDesktopHandlers = Layer.mergeAll(jiraHandlers)
export const bocDesktopServices = Layer.mergeAll(jiraServices)
```

Tool two changes only these compositions: `[jiraExtension, toolTwoExtension]`, `JiraRpcs.merge(ToolTwoRpcs)`, etc.

Validation: a unit test asserts unique extension ids, unique command ids and that RPC tags are prefixed with `Boc`. No runtime validation code.

## 7. Host contract

BOC renderer code needs a few OpenCode capabilities without importing OpenCode internals. Fork-owned `packages/app/src/boc/host.tsx` composes existing hooks into a `BocHost`:

```ts
type BocHost = {
  navigate(to: string): void                 // useNavigate
  location(): { pathname: string; search: string }   // useLocation
  route(): { type: "boc"; id: string } | { type: string }   // useCurrentRoute, structurally typed (no LayoutRoute import)
  openExternal(url: string): void            // usePlatform().openExternal
  locale(): string                           // useLanguage().locale
  platform: "web" | "desktop"                // usePlatform().platform
}
```

Not in the host: command registration (the command bridge does it), storage (main-owned), whole contexts or stores. Extend the host only when a tool proves a need.

The bridge files stay boring:

```text
packages/app/src/boc/
  host.tsx          createBocHost() from hooks
  route.tsx         BocRouteBridge (wraps BocScreen in BocHostProvider), preloadBocRoute(pathname)
  navigation.tsx    BocNavigationBridge (replaces the current BocNavButton)
  commands.tsx      BocCommandBridge (renders null; command.register("boc", ...))
  route.test.ts     asserts currentRoute("/boc/jira") and "/boc/unknown" parse to { type: "boc", id }
```

`packages/app/src/boc/boc.tsx` is replaced by these files.

## 8. Stable slots

### Route slot

`routes.tsx` registers one wildcard route inside `AppRoutes` and one generic preload delegation:

```tsx
<Route path="/boc/*path" component={BocRouteBridge} />
```

```ts
if (pathname.startsWith("/boc/")) return preloadBocRoute(pathname)
```

`BocScreen` renders a BOC-owned not-found state for unknown ids and a desktop-required state when `desktopOnly` and `useBocDesktop()` is undefined.

### Layout route

`layout.tsx` gains one variant and one parser case:

```ts
| { type: "boc"; id: string }
...
if (parts[0] === "boc") return { type: "boc", id: parts[1] ?? "" }
```

Verified: `settings/surface.tsx` uses `Exclude<LayoutRoute, { type: "settings" }>` and `settings/shell.tsx` switches without exhaustiveness, so no other upstream file changes for the new variant. The agent confirms with `bun typecheck` in `packages/app`.

### Navigation slot

The existing titlebar diff (two mounts plus import) stays; the component becomes `BocNavigationBridge`.

- Vertical sidebar: one compact row per registered extension.
- Horizontal titlebar: a single icon button when one extension is registered; a popover listing extensions when more than one.
- Active state: `route().type === "boc" && route().id === extension.id`.

### Command slot

`BocCommandBridge` mounts once in `routes.tsx` `AppLayout` (always mounted, below `CommandProvider`, works on web and desktop). It registers `boc.<id>.open` for each extension plus each extension's own commands. Navigation must not be the only place commands are registered; it can be hidden in responsive layouts.

### Desktop slot

`desktop-app.tsx` wraps the tree once:

```tsx
<PlatformProvider value={platform}>
  <BocDesktopProvider>   // from packages/desktop/src/boc/provider.tsx
    <AppBaseProviders ...>
```

`packages/desktop/src/boc/provider.tsx` is fork-owned: it imports `invoke` from `../renderer/ipc-client` and `createBocDesktopAPI` from `@boc/extensions/desktop/renderer`, and renders the provider from `@boc/extensions/renderer`. The provider must be an ancestor of the router; `AppInterface` children are siblings of the route outlet and do not work for context.

### Route restore after restart

`packages/desktop/src/renderer/window/route-storage.ts` `acceptedLastActiveUrl` only restores `/`, `/new-session` and session URLs. BOC routes restore to Home after an app restart. Decision for the MVP: accept this, zero touch. Revisit only if it annoys in daily use (one-line addition, then added to the allowlist).

## 9. Desktop RPC composition

```ts
// packages/desktop/src/shared/ipc-rpc.ts
export const DesktopRpcs = AppRpcs.merge(StorageRpcs, ..., EventRpcs, BocDesktopRpcs)
// packages/desktop/src/main/ipc.ts
const services = Layer.mergeAll(DesktopFiles.layer, DesktopStorage.layer, Wsl.layer, bocDesktopServices)
const handlers = Layer.mergeAll(appHandlers, ..., eventHandlers, bocDesktopHandlers)
```

The merge makes `invoke("BocJira...")` in `ipc-client.ts` fully typed with no further changes. `createBocDesktopAPI(invoke)` in `@boc/extensions/desktop/renderer` accepts an `invoke` typed over the BOC RPC tags and returns a namespaced, promise-based API for renderer components.

BOC main code imports `electron` directly (`app.getPath("userData")`, `safeStorage`). It does not depend on upstream desktop services such as `DesktopStorage`. Each tool owns its own `electron-store` file (`boc.jira`) created lazily on first use, never at module load (userData path is set during startup).

Rejected alternative: a generic string-based `boc.invoke({ tool, operation, payload })`. It weakens schemas, autocomplete, auditing and security for a few saved lines.

## 10. Upstream touch budget

Permanent integration surface. Exact line counts were confirmed by Session 1 against `upstream/beta`. The generated lockfile is the only additional touch: a clean checkout needs the new workspace and dependency edges in the frozen Bun lockfile.

| Upstream-owned file | Additive change | Size |
| --- | --- | ---: |
| `bun.lock` | generated workspace and app/desktop dependency edges | +38 / -15 lines |
| `packages/app/package.json` | `@boc/extensions` workspace dependency | +1 / -0 lines |
| `packages/app/src/shell/routes/routes.tsx` | import, wildcard route, `BocCommandBridge` in `AppLayout`, preload delegation | +5 / -0 lines |
| `packages/app/src/shell/state/layout.tsx` | `LayoutRoute` variant, parser case | +2 / -0 lines |
| `packages/desktop/package.json` | `@boc/extensions` workspace **devDependency** | +1 / -0 lines |
| `packages/desktop/src/shared/ipc-rpc.ts` | import, one merge argument | +2 / -1 lines |
| `packages/desktop/src/main/ipc.ts` | import, two merge arguments | +3 / -1 lines |
| `packages/desktop/src/renderer/desktop-app.tsx` | import, provider wrap | +3 / -0 lines |

Existing fork touches that remain: `titlebar.tsx` (two mounts plus import), `en.ts` (only `titlebar.channel.boc`), the channel identity changes in desktop build scripts and config, `AGENTS.md` fork notes.

Removed from the v1 budget and why:

- `app.tsx`: command bridge mounts in `routes.tsx` `AppLayout` instead.
- `renderer/api.ts`, `renderer/api-types.ts`: fork-owned `packages/desktop/src/boc/provider.tsx` uses `invoke` directly.
- `settings/shell.tsx`: verified no exhaustiveness on `LayoutRoute`.
- `shell/state/layout.test.ts`: BOC route cases live in `packages/app/src/boc/route.test.ts`.
- `en.ts` BOC feature strings: move to `packages/boc/src/tools/jira/i18n/en.ts` and the BOC dictionary.

After this one-time work, adding another tool requires a new `packages/boc/src/tools/<tool>/` directory, one entry in `bocExtensions`, and optional merges in `BocDesktopRpcs`, `bocDesktopHandlers`, `bocDesktopServices`. No upstream file changes.

## 11. Fork-surface audit

`packages/boc/scripts/audit-fork-surface.ts`:

1. `git merge-base HEAD upstream/beta` (fails with a clear message if `upstream` is not fetched).
2. `git diff --name-only <base>...HEAD`.
3. Every path must match `fork-surface.json`: either an `owned` glob (`packages/boc/**`, `packages/app/src/boc/**`, `packages/desktop/src/boc/**`, `packages/desktop/icons/boc/**`, `BOC_*.md`, `.github/workflows/boc-*.yml`) or an `approved` entry `{ path, reason }`.
4. Exit 1 listing unlisted paths. Report paths only; do not try to predict merge conflicts.

Run it locally at the end of every session and in a fork-owned workflow `.github/workflows/boc-audit.yml` (adds the `upstream` remote, fetches `beta`, runs the script). The script is the enforceable form of Section 10.

## 12. Implementation gotchas (read before coding)

- `electron-vite` externalizes `dependencies` of `packages/desktop` in the main bundle. `@boc/extensions` must be a **devDependency** there (like `@opencode-ai/app`) or Electron main will `require` raw TypeScript at runtime.
- Use `"effect": "catalog:"` in `packages/boc/package.json`. RPC groups from two packages only merge when they share one `effect` instance and version; the main bundle already has `resolve.dedupe: ["effect"]`.
- Follow `@opencode-ai/ui`: export raw `.ts`/`.tsx` from `src/` through `package.json` `exports`; `vite-plugin-solid` and `tsgo -b` in `packages/app` consume them directly. `tsconfig.json` mirrors `packages/ui/tsconfig.json` (`jsx: preserve`, `jsxImportSource: solid-js`, `noEmit: true`), plus `types` for `node` and `electron` because main code lives in the same package.
- Renderer subpaths must not import `electron`. Add a test that imports `@boc/extensions/renderer` under happy-dom and asserts no `electron` module is loaded (or keep the boundary by review; the audit does not check it).
- `bun test` cannot run from the repo root; the boc package needs its own `test` script: `bun test --conditions=solid --preload ./happydom.ts ./src`.
- `electron-store` must be instantiated lazily after `app.setPath("userData", ...)`; see the comment in `packages/desktop/src/main/storage/store.ts`.
- `currentRoute` throws for unknown paths. The `boc` case in `layout.tsx` must land in the same change as the route registration or the shell crashes on `/boc/*`.
- Do not run or restart the desktop app or the server as part of verification (package `AGENTS.md`). Manual smoke tests are the human's job; agents deliver automated checks.
- Channel identity in the app build: `packages/app/vite.js` (channel guard) and `packages/app/src/env.d.ts` (`VITE_OPENCODE_CHANNEL` type) include `"boc"` since 2026-09-04. Both belong to the existing identity touches in the fork-surface allowlist. The channel indicator still uses the dev icon for `boc` (only its label says "Boc"); changing the icon would be a behavior change in upstream code and is deliberately not done.

## 13. Jira security and data boundary

### MVP authentication

One Jira Cloud site: site URL, account email, API token.

- The token is stored only by Electron main using `safeStorage`; only ciphertext is persisted in the BOC-owned store. The renderer receives connection status and non-secret site/account metadata, never the token.
- If `safeStorage.isEncryptionAvailable()` is false, do not store plaintext. Show an unsupported-state message; the user re-enters credentials per session or the feature stays unavailable.
- OAuth 2.0 (3LO) is a later phase if distribution expands. Electron cannot protect a client secret; that phase may require a small token broker. Not required for the internal beta.

### Network boundary

- Authenticated requests run in Electron main only.
- Allow only `https://<site>.atlassian.net` origins for the MVP.
- Validate RPC inputs with Effect Schema at the process boundary; decode Jira responses once with Effect Schema and pass typed domain data inward.
- Redact `Authorization`, tokens and response bodies from logs and displayed errors. Error messages shown to users are normalized categories (auth, permission, not-found, rate-limit, network, malformed), never raw Jira payloads.
- Respect `Retry-After` and Atlassian rate limits; bounded retries for safe reads only.
- Suppress stale results when board/sprint/filter selection changes quickly.

### Jira endpoints (verify against current Atlassian docs before implementing)

- Boards, board configuration, sprints: Agile REST `/rest/agile/1.0/board...` (offset pagination `startAt`/`maxResults`/`isLast`).
- Issues: `/rest/api/3/search/jql` with `nextPageToken` pagination; the old `/rest/api/3/search` is deprecated. Scope by board filter or `sprint = <id>`.

## 14. Jira Board MVP

Read-only.

Included: configure and test one connection; list accessible Scrum and Kanban boards; save up to ten board shortcuts; default board; active/future sprint selection where the board has sprints; columns derived from board configuration; fetch all issue pages; search; filters for assignee, issue type and priority; explicit refresh; loading, empty, error, rate-limit and offline states; compact BOC-native cards; lightweight issue inspector; open in Jira via `host.openExternal`; persist non-secret preferences in the main-owned store.

Excluded: editing fields or transitions, drag-and-drop ranking, create/delete, comments, deployment/PR/agent enrichments from Emdash, AI summaries, automatic OpenCode session creation, Jira Server/Data Center, OAuth 3LO.

## 15. BOC-native product design

Use Emdash as domain knowledge, not as the visual specification.

- Use `@opencode-ai/ui` typography, spacing, focus rings, controls, dialogs, popovers and semantic color tokens; compact density; the shell insets and raised panel treatment used by current surfaces.
- No nested app chrome. Horizontal scrolling for columns. Keyboard traversal and visible focus. Column colors as small accents.
- Follow `packages/app/AGENTS.md` and `packages/ui/AGENTS.md` for typography (`--line-height-compact` for 13px text) and localization (English source strings only, no hardcoded copy).

```text
Jira Board     [Board v] [Sprint v] [Search] [Filters] [Refresh]
--------------------------------------------------------------
| To do       | In progress     | Review       | Done         |
| issue card  | issue card      | issue card   | issue card   |
```

Board settings are a normal BOC dialog: connection, saved boards, default board.

## 16. Reuse from Emdash

Reference: `/Users/thorsten/Projekte/app/emdash`

Adapt (logic and tests, not code style):

- `apps/emdash-desktop/src/shared/core/jira/jira-board.ts` and its test: status-to-column mapping, sprint selection.
- `apps/emdash-desktop/src/main/core/jira/service.ts`, `controller.ts`: endpoint selection, pagination, response mapping.
- `apps/emdash-desktop/src/main/core/secrets/encrypted-app-secrets-store.ts`: `safeStorage` pattern.
- `apps/emdash-desktop/src/renderer/features/jira/use-jira-board-lanes.ts`: grouping logic (port to a pure function).
- `apps/emdash-desktop/src/shared/core/jira/jira-redaction.ts`: which fields count as sensitive; the MVP needs a much smaller version.
- `JIRA_BOARD_INTEGRATION_PLAN.md` there: decisions and edge cases already learned.

Do not copy: React components/hooks, Emdash routing/RPC/database/task architecture, deployment/PR/AI coupling, styling that bypasses UI tokens, broad Jira SDKs. Prefer a small `fetch` client with Effect Schema decoding.

## 17. Delivery: four agent sessions

Each session is one fresh agent. Each has a scope, an exit condition, verification commands and handover duties (Section 21). Branch per session, PR into `boc-beta`, conventional commit titles.

### Session 1 — Extension seam (branch `boc-extensions`)

- Create `packages/boc/` with registry, host contract, screen resolver, i18n layer, desktop RPC/handler composition and `createBocDesktopAPI`.
- Add the fork-owned bridges in `packages/app/src/boc/` and `packages/desktop/src/boc/`; replace `boc.tsx`.
- Apply the seven upstream touches from Section 10 exactly; move BOC strings out of `en.ts`.
- Jira extension is a placeholder screen plus one real RPC shape (`BocJiraGetConnectionStatus` returning `not-configured`) to prove the main/renderer path end to end.
- Test-only `example` extension fixture; registry uniqueness test; route parsing test; RPC composition test.
- Fork-surface audit script, `fork-surface.json`, `.github/workflows/boc-audit.yml`.

Exit: `/boc/jira` opens from sidebar row, titlebar button and command palette; `/boc/unknown` shows not-found; web build shows desktop-required; `bun typecheck` passes in `packages/boc`, `packages/app`, `packages/desktop`; tests pass in `packages/boc` and `packages/app` (focused); audit passes with the recorded budget.

### Session 2 — Jira connection (branch `jira-connection`)

- RPC schemas: get status, save connection, test connection, disconnect.
- Main: Jira client (fetch, origin allowlist, Schema decoding, error normalization, redaction), `safeStorage` credential store, BOC store file.
- Renderer: settings dialog (site, email, token, test, save, disconnect), status states, English strings.
- Tests with fixtures: success, auth failure, permission failure, malformed response, rate limit, encryption unavailable; a test that the token never appears in any RPC success schema.

Exit: a user can save and test one connection; token never reaches renderer state or logs; all checks green.

### Session 3 — Read-only board (branch `jira-board`)

- Board discovery, saved boards (max ten), default board; board configuration to columns; sprint listing and selection; issue pagination; pure grouping and filter functions.
- Toolbar, columns, cards, inspector, search, filters, refresh; loading/empty/error/rate-limit/offline states; narrow and wide widths.

If the session runs long, split at "data and minimal board render" (3a) and "toolbar, filters, inspector, states" (3b) and record the split in the handover.

Exit: the board works against fixtures and a real test site (human smoke test), usable at narrow and wide widths, all checks green.

### Session 4 — Hardening (branch `jira-hardening`)

- Stale-result suppression and cancellation; `Retry-After` handling; redaction verification; keyboard and accessibility pass.
- Lazy-loading proof: normal startup and non-BOC routes do not load Jira chunks (inspect build output).
- Upstream merge rehearsal in a scratch worktree (`git merge --no-commit upstream/beta`), record conflict-prone seams, abort.
- Final handover: "how to add tool two" checklist verified against the example fixture.

Exit: all Section 20 criteria met; handover marks the plan complete.

### Later phases

Only after the read-only board is stable: start a session from an issue through a narrow host capability; explicit transitions with confirmation; drag-and-drop; OAuth 3LO. Each mutation gets its own security and UX review.

## 18. Testing and verification

Package tests (`packages/boc`): registry validation, screen resolution, i18n fallback, Jira response decoding, board/status/column mapping, pagination, filtering and search, error normalization, credential store behavior behind the main-owned boundary, renderer components against fixtures.

Integration (fork-owned test files in app/desktop): `/boc/jira` parses to `{ type: "boc", id: "jira" }`; unknown id renders not-found; `BocDesktopRpcs` merges into `DesktopRpcs` and handler layers compose; missing desktop provider yields desktop-required.

Commands, always from package directories:

```text
packages/boc:     bun typecheck && bun test
packages/app:     bun typecheck && bun test --conditions=solid --preload ./happydom.ts src/boc
packages/desktop: bun typecheck && bun test
repo root:        bun packages/boc/scripts/audit-fork-surface.ts
```

## 19. Upstream sync procedure

1. `git fetch upstream && git merge upstream/beta` on `boc-beta`; never push to upstream.
2. Resolve conflicts in approved seam files as additive registrations.
3. Run the fork-surface audit; review the diff outside fork-owned directories.
4. Run focused typechecks and tests for any seam upstream changed.
5. Human smoke test: Home, new session, session, settings, one BOC route.

If a seam conflicts repeatedly, move more glue into the fork-owned bridge or find a more stable extension point. Do not duplicate upstream components into `packages/boc/`.

## 20. Definition of done

- Jira opens from the existing BOC navigation location and looks like part of BOC.
- All Jira implementation, tests, fixtures, translations and schemas live in fork-owned code.
- Upstream-owned code contains no Jira-specific references.
- The permanent upstream diff matches Section 10 and the audit passes.
- The test-only example extension proves a second tool needs no upstream changes.
- Jira credentials are main-process-owned and encrypted at rest.
- Normal routes and startup do not eagerly load Jira code.
- The read-only board handles pagination, native columns, errors, offline state and rate limits.

## 21. Agent protocol (how sessions hand over)

Every session follows this, in order.

Start:

1. Read `BOC_HANDOVER.md` first (current state, open questions, your start prompt), then this plan, then the package `AGENTS.md` files of the packages you touch.
2. Re-run the previous session's verification commands before changing anything. If they fail, fix or record that first.
3. Create the session branch from `boc-beta`.

Work:

4. Stay inside the session scope. Anything else becomes a "Suggestions" bullet in the handover, not a change.
5. Product decisions you cannot resolve from the plan go into "Open questions for Thorsten" in the handover; choose the plan's stated default and continue.
6. Never restart the app or server; never push to upstream; never add BOC strings to upstream locale files; never edit below the boundary line in `AGENTS.md`.

Finish:

7. Run all verification commands from Section 18 plus the audit. Fix failures before handing over.
8. Update `BOC_HANDOVER.md`: append a session entry using its template (scope done, deviations with reasons, upstream files touched with line counts, verification output summary, known issues, suggestions, open questions) and replace the "Next session start prompt" with a paste-ready prompt for the next session.
9. Update this plan only in: Section 10 table (confirmed line counts, or an approved new touch with reason), Section 12 (new gotchas), Section 17 (a recorded split of a session). Do not rewrite other sections; propose changes in the handover instead.
10. Commit with `type(scope): summary`; open the PR against `boc-beta`.

## 22. Decisions taken for the agents (defaults)

Recorded so no session blocks on them. Thorsten can override any of these in `BOC_HANDOVER.md`.

1. Other tools are unknown. The registry is shaped by Jira plus the test-only example fixture; do not generalize further.
2. Jira Cloud only.
3. Email plus API token for the internal beta; OAuth later.
4. Vertical sidebar shows one row per extension; horizontal titlebar shows one button for one extension and a popover for more.
5. Connection and saved boards are global to the installation, not per project.
6. BOC routes are not restored after app restart in the MVP.
7. Web build renders the desktop-required state for Jira; commands still register on web.
