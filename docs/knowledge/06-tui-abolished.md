---
name: feedback-tui-abolished-tool-only
description: "Daniel's standing order — never use native Edit/Write for code; ALL code edits via mcp__atomic-edit__* so only the tool's char-level diff is shown, never the harness TUI line-diff"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 61ac8bd2-ecc3-4713-880c-0254ea9a0694
---

RATIFIED 2026-05-15 (repeated, emphatic): **"TUI está abolida. A ferramenta é
o único padrão de trabalho."**

**Why:** Daniel (non-technical founder) audits by what the CLI renders. The
Claude Code / Codex closed harness draws a whole-line red/green +/- block for
its **built-in `Edit`/`Write`/`NotebookEdit`** tools, and that renderer
**cannot be disabled from inside the repo** (closed harness — immutable
boundary, stated consistently, never to be re-promised as fixable). The
harness draws **nothing** for an MCP tool call — it just shows the tool
result text. So the ONLY way to honor "TUI abolida" is to **never invoke the
native edit tools** and route every code change through `mcp__atomic-edit__*`,
whose result carries the char-level `atomicDiff` ([-removed-]{+added+}) +
`founder` block. Then the tool's output is the only thing shown.

**How to apply (permanent, all sessions, all CLIs):**

1. For ANY code/text/JSON edit: use `mcp__atomic-edit__*` ONLY
   (replace_range/insert_at/delete_range/apply_edits/replace_text/
   replace_literal/edit_symbol/rename_symbol[_cross_file]/add_import/
   remove_import/replace_property_value/wrap_range/transaction). NEVER the
   built-in Edit/Write/NotebookEdit for code. (Built-in Read/Grep/Glob/Bash
   are fine — they don't render diffs.)
2. If `mcp__atomic-edit__*` is NOT in the session tool list, the server is
   not loaded → say so honestly and do not silently fall back to native
   Edit. Enablement: `.mcp.json` has `atomic-edit`; `~/.claude.json`
   `projects["/Users/danielpenin/whatsapp_saas"].enabledMcpjsonServers` must
   include `"atomic-edit"` (set 2026-05-15) AND a fresh session is required
   (MCP loads at session start; mid-session `.mcp.json`/enable changes do
   NOT hot-load — documented limitation). See [[feedback_mcp_project_approval]].
3. Never claim the harness TUI line-diff was "turned off" — it cannot be.
   The honest mechanism is *avoidance* (tool-only ⇒ harness renders nothing),
   not disabling. Overstating this = the fake-completion the rules forbid.
4. Same rule for Codex/OpenCode via the shared MCP (CLI_ACTIVATION_MATRIX).

**Enforcement COMPLETE across all 3 CLIs (2026-05-16, branch
feat/kloel-cognitive-organism):**
- Claude Code: `.claude/settings.json` PreToolUse →
  `scripts/mcp/atomic-edit/atomic-only-hook.mjs` DENIES Edit/Write/MultiEdit/
  NotebookEdit + Bash in-place code mutation + apply_patch on code-ext files
  (steers to mcp__atomic-edit__*), ALLOWS prose/.md + non-edit tools. Stop
  hook runs `trace-coverage-audit.mjs` (advisory). Full matrix re-tested
  2026-05-16: T1–T11 all correct.
- **`.ipynb` leak fixed 2026-05-16** (this session): `NotebookEdit x.ipynb`
  was returning `allow` because `.ipynb` was absent from `CODE_EXT`. Added
  `ipynb|` to all 3 regexes (hook `CODE_EXT`, hook `bashEditsCode`
  codeTarget, auditor `CODE`) via atomic-edit. Now NotebookEdit + `tee/>
  x.ipynb` → deny.
- Codex: `.codex/hooks.json` (Daniel solved it) — PreToolUse routes
  Write/Edit/MultiEdit + Bash + apply_patch through the SAME
  `atomic-only-hook.mjs`; Stop runs trace-coverage. ✓
- OpenCode: `.opencode/plugin/workspace-gates.ts` now runs `runAtomicGate()`
  (spawns the SAME hook, parses its stdout JSON, `output.abort` on deny)
  BEFORE the workspace gate, for Write/Edit/MultiEdit/NotebookEdit/Bash/
  apply_patch. Was previously soft-only (AGENTS.md "prefer"); now HARD.
  Runtime-simulated 2026-05-16: edit code→deny, .md→pass, .ipynb→deny,
  sed -i→deny, npm test→pass. atomic-edit server smoke 83/83.
- Single source of truth = `scripts/mcp/atomic-edit/atomic-only-hook.mjs`,
  shared verbatim by all 3 CLIs (no rule duplication).
- `shapePayload` emits a compact human `summary` first (✅ + file +
  [-x-]{+y+} + validation + zeroCodeTrust + trace path) = the on-screen
  proof replacing the banned native line-diff.

Related: [[reference_atomic_edit_mcp]], [[feedback_mcp_project_approval]],
[[feedback_no_gambiarra]].
