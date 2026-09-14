---
name: boc-upstream-sync
description: Review, merge, and verify upstream/v2 changes in the Boc fork. Use for upstream pulls, syncs, merge rehearsals, conflict resolution, or compatibility audits; prioritize core, app, and desktop impact.
---

# Sync Boc with upstream

Keep `v2` close to `upstream/v2` while preserving the smallest supported Boc integration surface.

## Boundaries

- Read `AGENTS.md`, `packages/boc/fork-surface.json`, and applicable package `AGENTS.md` files first.
- A review-only request stops before merge, commit, or push. A requested sync includes in-scope compatibility fixes and verification.
- Never push to `upstream`, rebase shared `v2`, force-push, discard unrelated changes, or hide failures by weakening checks.
- Preserve a dirty worktree. Use a scratch worktree for rehearsal; do not stash or overwrite user changes without explicit direction.

## Inspect before merging

1. Confirm the branch, remotes, status, and merge base. Fetch `upstream/v2`.
2. Review the full incoming range with `git log HEAD..upstream/v2` and `git diff HEAD...upstream/v2`; do not rely on conflicts alone.
3. Treat `fix(core):`, `fix(app):`, and `fix(desktop):` commits as high-priority signals. Inspect every incoming change under those packages even when its commit scope differs.
4. Match incoming paths and symbols against the approved surface and imports in fork-owned code. Inspect callers, types, defaults, provider order, build config, and generated clients.
5. Give TUI-only changes lower priority, but follow any shared core, protocol, schema, client, UI, or server impact.
6. Look for new upstream extension points or APIs that can replace a Boc override, copied assumption, or brittle internal import.

## Merge and adapt

- Follow the repository workflow: merge `upstream/v2` into `v2`; do not squash or rewrite upstream history.
- Resolve each conflict by understanding both sides. Keep upstream behavior intact and reapply only the narrow Boc registration, channel case, or strategy hook; never choose whole-file ours/theirs blindly.
- Fix merge-caused type, test, build, runtime-boundary, and generated-client issues within scope. When upstream provides a better seam, migrate the fork-owned bridge and remove the obsolete touch.
- Keep Boc product names and behavior out of upstream files unless the path is approved in `packages/boc/fork-surface.json`.
- Update `packages/boc/fork-surface.json` in the same change when the approved upstream integration surface changes.
- If Protocol or Server `HttpApi` changed, run `bun run generate` from `packages/client`; never edit generated clients directly.

## Verify before delivery

- Run `git diff --check`, search for conflict markers, and inspect every changed approved upstream file after resolution.
- Run the fork-surface audit from the root.
- Run `bun typecheck && bun test` in `packages/boc` and `packages/desktop`.
- Run `bun typecheck` and the focused Boc tests in `packages/app`.
- Run focused core/server/client checks for touched APIs; build app/desktop for routing, IPC, channel, bundling, lazy-load, or resource changes.
- Fix in-scope failures, then repeat affected checks. Stop for a product decision, unavailable secret/service, or unrelated pre-existing failure and report it precisely.
- Summarize the upstream range, prioritized commits, conflicts, adaptations, retired seams, documentation changes, checks, and remaining manual smoke tests.
- For a requested sync, make logical conventional commits and push only to `origin/v2` after checks pass.
