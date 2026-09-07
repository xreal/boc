# Project Controls delivery

## Implemented behavior

Boc exposes the screen, navigation entry, and session command as **Project Controls**. Bergflow remains the underlying plugin and diagnostic identity. Boc bundles the private `@bergflow/opencode` 0.2.1 artifact through an opt-in host fallback. The same package loads independently in original OpenCode V2. Explicit external definitions take precedence, keep their options, and never produce a second active provider. Disabled or broken external configuration does not silently activate the bundle. Ordinary startup does not download a plugin or rewrite configuration.

The portable service owns `bergflow.control.v1`, project storage, revisions, mutation validation, and application. TUI and native Boc are clients of that service. Project policy is shared across worktrees on one server; inventories and application status belong to each Location. A protocol-owned process registry is necessary because real local-plugin reloads evaluate separate module graphs. No service manager, version adapter, model policy-writing tool, or loopback browser bridge is added.

Controls start without integration credentials and without adding Bergflow agents or tools. `integrations: true` explicitly enables the existing integrations. Project-owned ambient `AGENTS.md` files use Boc's structured selection hook; agents, global/unknown instructions, nested read-triggered instructions, and existing Session history remain read-only. Skills, observed tools, and configured MCP servers use public transforms and execution/permission hooks. Tool inventory is explicitly incomplete; MCP connection/authentication state is separate from enabled intent. Already running operations continue.

Successful persistence is authoritative even if application or the final snapshot fails. Retry applies the saved setting without another policy write. Conflicts and unknown transport outcomes refresh state without automatically repeating a mutation. Legacy overrides are adopted; unsupported intent remains visible and can be cleared.

Native controls use existing authenticated server clients. Server/project/worktree selection is independent of session-tab changes and global Home selection. Missing remote plugins never trigger local fallback or installation. A session command supplies its explicit context. The screen supports search, category filters, override reset, application retry, read-only rows, orphan overrides, stale snapshots, and diagnosis. All product text uses the existing Boc English fallback dictionary.

The native presentation follows Jira and Deployments' shell insets, rounded raised frame, compact fixed header, and independently scrolling content. It uses theme-aware raised cards, a neutral project context panel, category filter chips with inventory counts, and matching focus rings for search and context selectors. Routine enabled/unconfirmed badges are omitted; disabled, applying, and failed states remain visible. Read-only rows are labeled directly, and instruction controls explain their ambient-only scope. Agent transforms/reloads exist in the public plugin API, but the bundled service intentionally does not expose agent mutations until their update behavior is verified. Instruction exclusion operates on structured source identity before rendering; no empty-string replacement or rendered-text filtering is used.

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

### Agent and instruction API audit — 2026-09-07

The follow-up audit used clean Boc `5a8cc02781` and portable Bergflow `1130767` working trees. The release pin is still `0.0.0-beta-19192`. No portable implementation, package version, archive, or application capability changed during this audit.

A disposable local plugin was exercised through authenticated RPC in isolated original `19192` and `19234` servers, with independent home/config/data/database directories. Both produced the same results:

- Removing a configured agent in plugin setup misses that agent in the pre-filter inventory; the later ConfigAgent transform creates it.
- Registering a filter after startup captures the configured definition and removes it. An ordinary `agent.reload()` preserves that result.
- Registering a later producer with `AgentEditor.update` recreates the removed ID. Another `agent.reload()` preserves the recreated agent, not the earlier exclusion.
- The exposed agent domain contains `get`, `list`, `transform`, and `reload`; neither server exposes an instruction domain.

This invalidates the assumption that transforms alone guarantee order-independent agent controls. Re-registering after `agent.updated` is not an atomic policy boundary: the registry is already readable before the asynchronous observer repairs it. Plugin activation retains the unchanged prefix and re-registers the changed suffix, including internal config plugins, so a once-late registration is not a lifecycle guarantee either.

The current core supplies these semantics:

- Implicit agent selection tries the configured selectable default, then `build`, then the first visible non-subagent. Explicit missing selections fail with `Session.AgentNotFoundError`; sessions are not automatically switched to a replacement. No selectable agent also yields a missing-agent failure during context selection.
- Each logical-step boundary resolves the current agent; a captured running request is not interrupted by registry mutation. New subagent calls resolve their target before permission evaluation and child creation.
- Auxiliary request identities are not uniformly registry selections: compaction uses the selected session context and the `compaction` request-hook identity. Removing that registry entry does not disable automatic compaction. Hidden auxiliary agents need an explicit supported-scope decision before exposing controls.
- `InstructionDiscovery` stores files by absolute path inside the existing composite `core/instructions` source. Config discovery includes global and upward files, including ancestors above a project when applicable; these are broader than the requested project-owned scope.
- `SessionContext.select` loads discovery before `InstructionState.prepare`. Existing epochs keep their baseline and append frozen chronological changes. Compaction advances the epoch; forks inherit current instruction values; revert resets the projection. Unavailable sources retain admitted content and block initial admission.
- Read-triggered nested `AGENTS.md` uses `SessionInstructions.load`, durable synthetic messages, and history-based deduplication. It is a separate ingestion path; filtering only ambient discovery would leave it active. Already admitted synthetic content is history, not a live discovery entry.

Verification from `packages/core`: `bun test test/config/agent.test.ts test/instruction-discovery.test.ts test/instruction-state.test.ts test/session-instructions.test.ts` — 45 passed, 159 assertions. Original-binary probes verify registry/API behavior, not model execution or functioning instruction toggles. Each disposable server was stopped after its probe.

The owner subsequently stopped the first selection-API implementation because it changed too much upstream-owned code. That implementation was removed. The approved pragmatic replacement handles only ambient instructions: six upstream-owned production files add narrow hook/facade wiring, while contracts and conversion remain in fork-owned `src/boc/` files. Shared State, config producers, nested instruction admission, and Session history remain unchanged. Hidden auxiliary agents and all other agents remain read-only.

The shipped facade reports complete structured candidates and accepts exclusions by stable project-relative ID. Bergflow synchronously applies already-loaded project policy, while global and unknown sources remain read-only. Unavailable discovery stays unconfirmed and blocks new mutations. Existing Session history is not rewritten; nested `AGENTS.md` discovered while reading files still loads normally. Original OpenCode servers do not expose the facade and continue to show read-only fallback inventory.

Ambient-selection verification used portable Bergflow `bd953c1` and the content-addressed 0.2.1 archive with SHA-256 `ef3d3bd65d8f808a88f3f21f9ba4eb50edb6d7818504fd6ffcad063b25355d18`. Bergflow typecheck, 46 tests, package build/import checks, original-server artifact smoke, and a real bundled Boc smoke passed. The bundled smoke found the project `AGENTS.md` as mutable, persisted a disable operation, and confirmed the selected inventory became disabled. Core/plugin/Boc/app/desktop typechecks, app/desktop production builds, 29 focused Core instruction tests, 195 Boc tests (one skipped), 15 app Boc tests, and both production-screen component tests passed. The component suite used a fresh isolated Storybook port; the user application and managed server were not restarted.

The supported original-server matrix currently contains the two exact tested versions above. Future beta APIs are not promised. The RPC major version and available operations determine UI compatibility; package-version equality is not required. The existing desktop/server compatibility rules remain unchanged.

This is a private archive, not a published npm package. Local/package-directory installation is documented in the portable README; the official plugin-add command only accepts registry/Git specifications and changes global server configuration. Registry publication requires a separately selected distribution channel.

The local macOS arm64 packaging check passed unsigned; the server extracted from the finished app also passed bundled RPC, skill mutation, and optional-integration checks. Release signing/notarization and Windows/Linux builds remain the normal release workflow's responsibility and were not published by this task. Next step: run that workflow when a Boc release is wanted; no extra plugin installation or server-version change is required.
