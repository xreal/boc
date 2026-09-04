# BOC Extensions — Handover Log

Living document. Every agent session appends one entry and rewrites the "Next session start prompt". The architecture lives in `BOC_EXTENSIONS_JIRA_PLAN.md`; do not duplicate it here.

- When you finish with our work COMMIT it!

## Current state

- Session 1 is implemented on branch `boc-extensions`: the static extension registry, generic app/desktop bridges, Jira placeholder, typed connection-status RPC, tests, and fork-surface audit are complete.
- The dummy `BocNavButton` has been replaced; `boc.title` and `boc.opened.description` now live in the BOC dictionary, while `titlebar.channel.boc` remains upstream-owned.
- Next up: Session 2 (Jira connection), after PR #1 is merged into `boc-beta`.

## Open questions for Thorsten

None blocking. Defaults are recorded in plan Section 22.

## Session log

### Entry template (copy for each session)

```markdown
### Session N — <title> — <date> — branch `<name>` — PR #<n>

Scope done:
- ...

Deviations from plan (with reason):
- ...

Upstream files touched (path — lines added/removed — allowlist reason):
- ...

Verification (commands run and result):
- packages/boc: `bun typecheck` ok, `bun test` 12 pass
- packages/app: ...
- packages/desktop: ...
- audit: ok / unlisted paths: ...

Known issues:
- ...

Suggestions (out of scope, not done):
- ...

Open questions for Thorsten:
- ...

Manual smoke checklist for Thorsten:
- [ ] ...
```

### Session 1 — Extension seam — 2026-09-04 — branch `boc-extensions` — PR #1

Scope done:
- Added raw-source workspace package `@boc/extensions` with browser-safe renderer, desktop shared/main/renderer subpath exports, a typed extension registry, host and desktop contexts, BOC i18n, and lazy screen resolution.
- Added generic app bridges for routing, navigation, commands, and host capabilities; added the desktop provider bridge and removed the dummy `boc.tsx`.
- Added the desktop-only Jira placeholder and the real `BocJiraGetConnectionStatus` RPC returning `{ status: "not-configured" }` through composed schemas, handlers, renderer API, and desktop RPC registration.
- Added the test-only example extension/RPC fixture plus registry, route, screen-state, i18n, renderer-boundary, RPC execution/composition, API mapping, and desktop merge tests.
- Added the fork-surface allowlist, local audit script, and GitHub Actions workflow.

Deviations from plan (with reason):
- Added `bun.lock` to the permanent approved surface (+38/-15). The new workspace package and its app/desktop dependency edges must be represented for frozen installs; omitting it leaves clean checkouts inconsistent.

Upstream files touched (path — lines added/removed — allowlist reason):
- `bun.lock` — +38/-15 — lock the BOC workspace and app/desktop dependency edges.
- `packages/app/package.json` — +1/-0 — register `@boc/extensions`.
- `packages/app/src/runtime/i18n/en.ts` — +0/-2 — move BOC feature copy into the BOC-owned dictionary.
- `packages/app/src/shell/routes/routes.tsx` — +5/-0 — mount generic BOC route/command slots and preload delegation.
- `packages/app/src/shell/state/layout.tsx` — +2/-0 — add and parse the generic BOC route variant.
- `packages/app/src/shell/titlebar/titlebar.tsx` — +3/-3 — replace the dummy fork button with the generic BOC navigation bridge.
- `packages/desktop/package.json` — +1/-0 — register `@boc/extensions` as a bundled devDependency.
- `packages/desktop/src/shared/ipc-rpc.ts` — +2/-1 — merge the BOC RPC group.
- `packages/desktop/src/main/ipc.ts` — +3/-1 — merge BOC handlers and services.
- `packages/desktop/src/renderer/desktop-app.tsx` — +3/-0 — mount the BOC desktop provider above the router.

Verification (commands run and result):
- packages/boc: `bun typecheck` ok, `bun test` 8 pass.
- packages/app: `bun typecheck` ok, focused `bun test --conditions=solid --preload ./happydom.ts src/boc` 3 pass.
- packages/desktop: `bun typecheck` ok, `bun test` 101 pass, 1 skip.
- audit: ok, 113 changed paths matched the owned globs or approved allowlist.

Known issues:
- BOC routes intentionally restore to Home after an app restart, as decided for the MVP.
- Manual UI and real main-to-renderer smoke testing remain for Thorsten; the app/server were not restarted.

Suggestions (out of scope, not done):
- None.

Open questions for Thorsten:
- None.

Manual smoke checklist for Thorsten:
- [ ] Open Jira from the horizontal titlebar button and confirm `/boc/jira` renders the placeholder with “Not configured”.
- [ ] Open Jira from the vertical sidebar row and from the `boc.jira.open` command palette entry.
- [ ] Open `/boc/unknown` and confirm the BOC-owned not-found state.
- [ ] Open the web build at `/boc/jira` and confirm the desktop-required state.

## Next session start prompt

Paste the block below into a fresh agent session.

````markdown
You are implementing Session 2 of the BOC extension system in the repo at /Users/thorsten/Code/boc (fork of opencode, branch line `boc-beta`, upstream remote `upstream`).

Read in this order before doing anything:
1. tmp/BOC_HANDOVER.md (this file; current state and open questions)
2. tmp/BOC_EXTENSIONS_JIRA_PLAN.md — the specification. Sections 3, 5–9, 12–14, 17 (Session 2), 18, 21 are binding for you.
3. AGENTS.md (root), packages/desktop/AGENTS.md, packages/app/AGENTS.md, packages/ui/AGENTS.md.

Before changing anything, confirm Session 1 is present on `boc-beta`, rerun all Session 1 verification commands from the handover, and create branch `jira-connection` from `boc-beta`. Then inspect the Session 1 seams in packages/boc/src/tools/jira/rpcs.ts, packages/boc/src/tools/jira/main/handlers.ts, packages/boc/src/tools/jira/renderer/screen.tsx, packages/boc/src/desktop/renderer/api.ts, packages/boc/src/desktop/main/index.ts, packages/desktop/src/main/storage/store.ts, and the Emdash references named in plan Section 16.

Your scope is exactly plan Section 17 "Session 2 — Jira connection":
- Add operation-specific RPC schemas for get status, save connection, test connection, and disconnect; keep every success shape free of the API token.
- In Electron main, implement the Jira Cloud fetch client, strict `https://<site>.atlassian.net` origin allowlist, Effect Schema response decoding, normalized/redacted errors, a lazily created BOC-owned `electron-store` file, and `safeStorage` credential handling.
- In the renderer, add the connection settings dialog with site, email, token, test, save, disconnect, and all required status states; put every visible English string in the BOC dictionary.
- Add fixtures and tests for success, auth failure, permission failure, malformed response, rate limit, encryption unavailable, persistence behavior, and proof that tokens never appear in RPC success schemas or displayed/logged errors.

Hard constraints: Jira Cloud only; credentials and authenticated network requests stay in Electron main; never persist plaintext when `safeStorage.isEncryptionAvailable()` is false; instantiate `electron-store` only after startup sets `userData`; never expose tokens through renderer state, RPC success values, logs, or raw errors; use only operation-specific typed RPCs; verify current Atlassian API behavior against official documentation before implementing. Do not restart the app or server. Do not push to upstream. Do not add Jira strings or identifiers to upstream-owned files. Keep changes inside scope; note anything else under "Suggestions".

Verification before handover (from package dirs, never repo root):
- packages/boc: bun typecheck && bun test
- packages/app: bun typecheck && bun test --conditions=solid --preload ./happydom.ts src/boc
- packages/desktop: bun typecheck && bun test
- repo root: bun packages/boc/scripts/audit-fork-surface.ts
Also confirm with `git diff --stat upstream/beta...HEAD -- ':!packages/boc' ':!packages/app/src/boc' ':!packages/desktop/src/boc'` that upstream-owned changes match Section 10 and record the real line counts.

Finish by following plan Section 21 steps 7–10: update BOC_HANDOVER.md (append a Session 2 entry using the template, update "Current state", write the Session 3 start prompt covering plan Section 17 "Session 3 — Read-only board" with the same structure as this prompt), commit as `feat(boc): add jira connection setup` on branch `jira-connection`, and open a PR against `boc-beta`.
````
