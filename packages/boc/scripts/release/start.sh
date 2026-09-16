#!/usr/bin/env bash

set -euo pipefail

repository="xreal/boc"
workflow="boc-release.yml"
branch="v2"
check_only=false

if [[ "${1:-}" == "--check-only" ]]; then
  check_only=true
  shift
fi

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 [--check-only] <version>" >&2
  echo "Version must be a stable semantic version, for example 0.2.3." >&2
  exit 1
fi

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [[ "$(git branch --show-current)" != "$branch" ]]; then
  echo "Boc releases must start from the local $branch branch." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Commit or restore tracked changes before starting a release." >&2
  exit 1
fi

echo "Fetching origin/$branch..."
git fetch origin "$branch" --tags

head="$(git rev-parse HEAD)"
remote="$(git rev-parse "origin/$branch")"
if [[ "$head" != "$remote" ]]; then
  echo "Local $branch ($head) does not match origin/$branch ($remote)." >&2
  exit 1
fi

tag="v$version"
if existing="$(git rev-list -n 1 "$tag" 2>/dev/null)" && [[ -n "$existing" && "$existing" != "$head" ]]; then
  echo "$tag already points to $existing instead of $head." >&2
  exit 1
fi

echo "Type-checking Boc..."
(cd packages/boc && bun typecheck)

echo "Testing Boc..."
(cd packages/boc && CI=1 bun run test)

echo "Type-checking desktop..."
(cd packages/desktop && bun typecheck)

echo "Testing desktop..."
(cd packages/desktop && CI=1 bun test)

echo "Auditing the committed fork surface..."
worktree_root="$(mktemp -d "${TMPDIR:-/tmp}/boc-release-check.XXXXXX")"
worktree="$worktree_root/repository"
cleanup() {
  git worktree remove --force "$worktree" >/dev/null 2>&1 || true
  rm -rf "$worktree_root"
}
trap cleanup EXIT
git worktree add --detach "$worktree" "$head" >/dev/null
(cd "$worktree" && bun packages/boc/scripts/audit-fork-surface.ts)

echo "Release checks passed for Boc $version at $head."
if [[ "$check_only" == true ]]; then
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required to dispatch the release workflow." >&2
  exit 1
fi

echo "Dispatching Boc $version..."
gh workflow run "$workflow" --repo "$repository" --ref "$branch" -f "version=$version"
