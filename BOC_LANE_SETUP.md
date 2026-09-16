# Lane setup for Boc

Boc creates new Desktop checkouts with [Lane](https://lane.lukeed.com/) through OpenCode's worktree plugin interface. Lane and the plugin must be installed on the machine running the OpenCode backend. Remote backends require their own installation.

## Install Lane

Install Lane `0.2.0` using the method documented at <https://lane.lukeed.com/> and verify it:

```sh
lane --version
```

## Install the OpenCode plugin

Install the tested plugin revision globally:

```sh
opencode plugin add git+https://github.com/bergthorsten/opencode-plugin-lane.git#28c61952e63358b9de0119c6160f0136bb0316be
```

Configure the plugin in the backend's global `opencode.jsonc`. If the command already created an entry, edit that entry instead of adding a duplicate:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "git+https://github.com/bergthorsten/opencode-plugin-lane.git#28c61952e63358b9de0119c6160f0136bb0316be",
      "options": {
        "executable": "<absolute-path-to-lane>",
        "dirty": false
      }
    }
  ]
}
```

Use an absolute executable path because a GUI-launched Desktop service may not inherit shell PATH configuration. Register the plugin globally or per project, never both.

## Checkout behavior

- Boc does not bundle Lane. If Lane or its plugin is unavailable, checkout creation fails without falling back to Git.
- `dirty: false` keeps ordinary Desktop-created Lanes clean. The agent preparation tool explicitly selects `lane-clean` or `lane-dirty` after the user confirms whether local changes should be copied.
- `lane-dirty` copies changes into the new Lane but never cleans the source checkout.
- Gitignored files are still reflinked unless excluded. Add `lane.exclude` entries for secrets such as `.env` when needed.
- Lane worktrees live under `<primary-checkout>/.lane/trees/`. The directory returned by the backend is authoritative in Boc.
- `lane init` is not required for worktree operation. Use it only when intentionally adopting Lane's context-memory workflow because it edits `AGENTS.md` and creates tracked files.
- Open the inner source repository when a development environment contains nested repositories.

For the nested Devenv project, configure the inner source repository:

```sh
cd src
git config --local --add lane.exclude .lane
```

Add further `lane.exclude` entries for ignored files that must not be copied.

## Devenv lifecycle

Boc's development-environment controls use Devenv's convention-based Lane lifecycle:

- `scripts/worktree-up.sh <lane-worktree-path> [--domain <domain>]`
- `scripts/worktree-down.sh <lane-worktree-path>`

Both executable scripts must exist in the active Devenv installation's `scripts` directory. Boc derives the stack identity from the authoritative Lane path, verifies the checkout owner and Docker Compose labels, and stores only its own operation/output state. It does not use `.devenv/worktrees` assignment files or `devenv stack` commands.

Leave the project's **Worktree startup script** empty when using Boc's environment controls. Create the Lane and use **Set up environment**, or let the confirmed `boc.prepare_environment` agent tool perform both steps, so Boc can own the lifecycle and show its live output.
