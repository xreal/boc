# Bergflow Controls delivery

## Implemented behavior

Boc bundles the private `@bergflow/opencode` 0.2.0 artifact through an opt-in host fallback. The same package loads independently in original OpenCode V2. Explicit external definitions take precedence, keep their options, and never produce a second active provider. Disabled or broken external configuration does not silently activate the bundle. Ordinary startup does not download a plugin or rewrite configuration.

The portable service owns `bergflow.control.v1`, project storage, revisions, mutation validation, and application. TUI and native Boc are clients of that service. Project policy is shared across worktrees on one server; inventories and application status belong to each Location. A protocol-owned process registry is necessary because real local-plugin reloads evaluate separate module graphs. No service manager, version adapter, model policy-writing tool, or loopback browser bridge is added.

Controls start without integration credentials and without adding Bergflow agents or tools. `integrations: true` explicitly enables the existing integrations. Agents and instructions are read-only until their update semantics can be supported faithfully. Skills, observed tools, and configured MCP servers use public transforms and execution/permission hooks. Tool inventory is explicitly incomplete; MCP connection/authentication state is separate from enabled intent. Already running operations continue.

Successful persistence is authoritative even if application or the final snapshot fails. Retry applies the saved setting without another policy write. Conflicts and unknown transport outcomes refresh state without automatically repeating a mutation. Legacy overrides are adopted; unsupported intent remains visible and can be cleared.

Native controls use existing authenticated server clients. Server/project/worktree selection is independent of session-tab changes and global Home selection. Missing remote plugins never trigger local fallback or installation. A session command supplies its explicit context. The screen supports search, category filters, override reset, application retry, read-only rows, orphan overrides, stale snapshots, and diagnosis. All product text uses the existing Boc English fallback dictionary.

The native presentation uses theme-aware raised cards, a distinct project context panel, category filter chips with inventory counts, and semantic effective-state badges. Read-only rows are labeled directly, with visible explanations for agent and instruction categories. Agent transforms/reloads exist in the public plugin API, but the bundled service intentionally does not expose agent mutations until their update behavior is verified. The previous browser instruction switch filtered rendered text; that mechanism is not a supported source-level instruction toggle.

Presentation follow-up verification: Boc/app/desktop typechecks, 195 Boc tests (one skipped), 15 app Boc tests, 122 desktop tests (one skipped), both production-screen component tests, app/desktop builds, and the fork-surface audit passed. Browser inspection covered light/dark desktop layouts and a 375px forced-RTL layout without horizontal overflow. Component checks cover keyboard toggle focus, instruction filtering, visible read-only explanations, and narrow context controls.

## Verification on 2026-09-07

- Portable package: typecheck, 45 tests, clean production build, package-content/import checks.
- Original binaries `0.0.0-beta-19192` and `0.0.0-beta-19234`: packed artifact installation, RPC, actual skill disable, passive startup, and optional integration loading. Automatic TUI discovery exercised with a real PTY.
- Boc executable: same bundled artifact, embedded integration Markdown assets, external artifact precedence with options/TUI, explicit disable, and broken external source with zero active Bergflow providers.
- Actual Git worktrees: new Location adopts saved policy; concurrent same-revision writes produce one commit and one conflict.
- Actual isolated service registrations: CLI-first replacement, Boc-first sharing, original CLI reuse of compatible Boc, external-to-bundle storage continuity, and incompatible original preserved alongside a reused isolated Boc fallback.
- Contract tests cover persistence failure, committed reload failure, retry without revision increment, stale revisions, removed/read-only capabilities, legacy policies, and committed revision reporting when the final snapshot fails.
- Renderer tests cover delayed responses after context switches and interrupted mutations across reconnect without resubmission. A different compatible package version is accepted.
- Production-screen browser QA covers light/dark, wide/375px layouts, RTL and paths, keyboard toggles, focus retention, search, and read-only controls. Reusable stories live in `packages/app/src/boc/bergflow.stories.tsx`; component regressions live in `packages/app/component-tests/bergflow.spec.ts`.
- Boc tests: 195 passed, one skipped. App Boc tests: 15 passed. Desktop suite: 122 passed, one skipped. Core plugin loader regression suite (19 passed), affected package typechecks, fork-surface audit, CLI build, and desktop renderer/main build passed. Both production-screen Playwright regressions passed.

## Reproduce delivery checks

From the Bergflow repository, build and pack, then run `scripts/artifact-smoke.ts <binary> <archive>` with the appropriate `--bundled`, `--integrations`, `--tui`, `--worktrees`, `--disabled`, or `--broken` flags. Bundle tests must use a freshly compiled Boc executable containing that archive.

From Boc, run:

```sh
bun packages/boc/scripts/bergflow/lifecycle-smoke.ts <boc-binary> <compatible-original-binary> <incompatible-original-binary>
bun packages/boc/scripts/audit-fork-surface.ts
```

Run typechecks/tests from package directories. Boc's `bun run test` selects browser Solid exports for reactive renderer tests. Run the Bergflow component tests using the app's existing `playwright.components.config.ts`.

The vendor filename includes the archive SHA-256 prefix so Bun cannot reuse an older local-tar cache entry. Rebuild the portable package, replace the archive, update the dependency/lockfile, and rebuild Boc together. Do not change the server pin during routine Bergflow/Boc releases.

## Release boundaries and next step

The supported original-server matrix currently contains the two exact tested versions above. Future beta APIs are not promised. The RPC major version and available operations determine UI compatibility; package-version equality is not required. The existing desktop/server compatibility rules remain unchanged.

This is a private archive, not a published npm package. Local/package-directory installation is documented in the portable README; the official plugin-add command only accepts registry/Git specifications and changes global server configuration. Registry publication requires a separately selected distribution channel.

The local macOS arm64 packaging check passed unsigned; the server extracted from the finished app also passed bundled RPC, skill mutation, and optional-integration checks. Release signing/notarization and Windows/Linux builds remain the normal release workflow's responsibility and were not published by this task. Next step: run that workflow when a Boc release is wanted; no extra plugin installation or server-version change is required.
