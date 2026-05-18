# Install — wiring Atomic OS into your AI CLI

One install of this repo serves **every** project. The MCP server anchors to
the nearest `.git` of the working directory your CLI launches it from, so you
clone/build `atomic-os` **once**, then point each CLI's MCP config at the
launcher.

## 0. One-time build

```sh
git clone https://github.com/danielgonzagat/atomic-os.git ~/atomic-os
cd ~/atomic-os
npm install
npm run build
npm run smoke       # expect: 0 failed
```

Let `LAUNCHER=~/atomic-os/src/atomic-edit-mcp-launcher.sh`. The launcher needs
no `tsx`/`npx` and no network; it self-rebuilds when a source `.ts` is newer
than `src/dist/server.js`.

## 1. Claude Code

Add to the project's `.mcp.json` (or `~/.claude.json` for global), then start
a **fresh session** (MCP servers load at session start):

```json
{
  "mcpServers": {
    "atomic-edit": {
      "command": "bash",
      "args": ["/ABSOLUTE/PATH/TO/atomic-os/src/atomic-edit-mcp-launcher.sh"],
      "description": "Atomic OS — structured read + atomic edit action space"
    }
  }
}
```

To enforce the "native diff banned for code" LAW, add a `PreToolUse` hook in
`.claude/settings.json` pointing at the shipped hook:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit|Bash|apply_patch",
        "hooks": [
          { "type": "command",
            "command": "node /ABSOLUTE/PATH/TO/atomic-os/src/atomic-only-hook.mjs" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command",
            "command": "node /ABSOLUTE/PATH/TO/atomic-os/src/trace-coverage-audit.mjs 2>&1 | tail -6 || true" }
        ]
      }
    ]
  }
}
```

Verify: in a fresh session, the `mcp__atomic-edit__*` tools are listed and a
native `Edit` to a `.ts` file is denied with a steer message.

## 2. OpenCode (all agents + subagents)

Register in project `opencode.json` (and/or global
`~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "atomic-edit": {
      "type": "local",
      "command": ["bash", "/ABSOLUTE/PATH/TO/atomic-os/src/atomic-edit-mcp-launcher.sh"],
      "enabled": true
    }
  }
}
```

Add a "prefer atomic, native edit banned for code" rule to your global
`~/.config/opencode/AGENTS.md` (see `docs/AGENTS.md` in this repo for ready
text) so every spawned subagent inherits it with no per-invocation flag.
Verify: `opencode mcp list` → `✓ atomic-edit connected`.

## 3. Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.atomic-edit]
command = "bash"
args = ["/ABSOLUTE/PATH/TO/atomic-os/src/atomic-edit-mcp-launcher.sh"]
```

Put the universal doctrine (mainstream edit banned for code, shared atomic MCP
is the default) into `~/.codex/AGENTS.md` (text in `docs/AGENTS.md`).
Verify: `codex mcp list` → `atomic-edit … enabled`.

## 4. Sanity check, any CLI

Ask the agent to "rename symbol X to Y across the repo". A correct install:
reads structure first (`code_outline`/`code_read_symbol`), edits via
`mcp__atomic-edit__atomic_rename_symbol_cross_file`, returns a char-level
`[-old-]{+new+}` proof + a trace path, and never shows a whole-line +/- block
for a sub-line change. If you see a red/green line diff for a one-token
change, the LAW hook is not wired.
