# Codex CLI integration

`hooks.json` is the Codex-side enforcement of the Atomic OS law — the Codex
equivalent of the Claude Code / OpenCode gates. Every native code-mutating
tool call (`Write`/`Edit`/`MultiEdit`/`NotebookEdit`, in-place `Bash`,
`apply_patch`) is routed through the **shared** `src/atomic-only-hook.mjs` and
denied; only the `mcp__atomic-edit__*` tools may mutate code; session end runs
`src/trace-coverage-audit.mjs`.

This is the genericized build: the original chained KLOEL-specific
`scripts/decomp/*` gates — removed here. It enforces **only** the atomic law.

`AGENTS.codex.md` is the real universal Codex doctrine that was in
`~/.codex/AGENTS.md` (mainstream edit banned for code, shared atomic MCP is
the default). It is equivalent to the portable `../../docs/AGENTS.md`; kept
here verbatim as the battle-tested original for reference.

## Install

1. Wire the MCP server in `~/.codex/config.toml` (see `../../docs/INSTALL.md`
   §3).
2. Copy the hook config into the repo you want gated:
   ```sh
   mkdir -p /path/to/YOUR-repo/.codex
   cp hooks.json /path/to/YOUR-repo/.codex/hooks.json
   ```
3. Point it at your atomic-os checkout (defaults to `<repo>/atomic-os` if
   unset):
   ```sh
   export ATOMIC_OS_HOME=/path/to/atomic-os
   ```
4. Put the doctrine into `~/.codex/AGENTS.md` — use `../../docs/AGENTS.md`
   (portable) or `AGENTS.codex.md` (original).

## Verify

`codex mcp list` → `atomic-edit … enabled`. A native `Edit` to a `.ts` file
in a Codex session is denied with the atomic steer; an atomic-tool edit
returns the char-level proof + a trace path.
