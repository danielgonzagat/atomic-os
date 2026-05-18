# OpenCode integration

`workspace-gates.ts` is the OpenCode-side enforcement of the Atomic OS law —
the OpenCode equivalent of the Claude Code `atomic-only-hook.mjs` PreToolUse
gate. It intercepts every code-mutating tool call (and every spawned subagent
inherits it, no per-invocation flag) and routes it through the **shared**
`src/atomic-only-hook.mjs`, so native/shell code edits are denied and only the
`mcp__atomic-edit__*` tools may mutate code.

This is the genericized build: the original chained KLOEL-specific
`scripts/decomp/*` workspace gates — removed here. It enforces **only** the
atomic-edit law.

## Install

1. Wire the MCP server (see `../../docs/INSTALL.md` §2).
2. Copy this plugin into the repo you want gated:
   ```sh
   mkdir -p /path/to/YOUR-repo/.opencode/plugins
   cp workspace-gates.ts /path/to/YOUR-repo/.opencode/plugins/
   ```
   OpenCode auto-loads `.opencode/plugins/*.ts`. It needs the
   `@opencode-ai/plugin` type package available (a tiny `.opencode/package.json`
   with that dep, like in the OpenCode docs).
3. Point it at your atomic-os checkout:
   ```sh
   export ATOMIC_OS_HOME=/path/to/atomic-os
   ```
   Resolution order: `$ATOMIC_OS_HOME/src/atomic-only-hook.mjs` → a copy
   co-located two levels up from the plugin → `<repoRoot>/atomic-os/src/...`.
   If none exists the gate is a safe no-op (it never fails open on a
   malformed hook response — only when atomic-os is genuinely not installed).

## Verify

In an OpenCode session, ask it to edit a `.ts` file with the native editor:
the call must be denied with the atomic steer message. A rename done via
`mcp__atomic-edit__atomic_rename_symbol_cross_file` must succeed and return
the char-level proof.
