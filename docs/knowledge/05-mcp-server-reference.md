---
name: reference-atomic-edit-mcp
description: Repo has a custom MCP server adding sub-line atomic edit tools; prefer them over blunt Edit for surgical changes
metadata: 
  node_type: memory
  type: reference
  originSessionId: a4bb891b-7da4-4203-a4b7-3107fb976411
---

Built 2026-05-15 to close the "Line-Oriented Action Bottleneck" Daniel
formalized; **v2** (same day) added the research-driven read side + symbol
edits. `scripts/mcp/atomic-edit/` + launcher
`scripts/mcp/atomic-edit-mcp-launcher.sh`, registered in `.mcp.json` as
`atomic-edit` (cross-session, launcher targets `server.ts`). Modules:
`engine.ts` (range/insert/delete/batch/literal/in-file-rename + ts/json
syntactic validation), `symbols.ts` (scoped fuzzy selector resolver),
`nav.ts` (read side), `advanced.ts` (symbol edits + cross-file rename +
preview diff), `guard.ts` (repo-containment + CLAUDE.md protected refusal),
`server.ts` (MCP SDK 1.29, stdio).

**14 tools (v3)** `mcp__atomic-edit__*`: READ `code_browse`, `code_outline`,
`code_read_symbol`; EDIT `atomic_replace_range/insert_at/delete_range`,
`atomic_apply_edits` (LSP TextEdit[]), `atomic_replace_literal`,
`atomic_edit_symbol` (replace|insert_after|remove by AST selector),
`atomic_rename_symbol` (in-file), `atomic_rename_symbol_cross_file`
(project-wide via tsconfig language service), `atomic_add_import`,
`atomic_remove_import` (deduped, comma-safe), `atomic_replace_property_value`
(scoped). Every mutating op: no-syntax-regression check before atomic write
(temp+fsync+rename), all-or-nothing, optional `expectedSha256` optimistic-
concurrency guard (+ `afterSha256` returned), `preview:true` dry-run,
Expansion-Factor metric. v3 import/property/sha ops adopted from Codex's
own `~/.codex/bin/semantic-edit.cjs` but routed through validate()+atomic
write (Codex's wrote via raw text replace w/o reparse — strictly worse).
Research basis: CodeStruct (arXiv 2604.05407 — readCode is the dominant
accuracy lever), To Diff or Not to Diff (2604.27296), Aider, Kiro.

**VALIDATED OPERATIONALLY 2026-05-15** (before any session restart): drove the
server through the real production path (launcher → MCP stdio client) and it
**edited its own source correctly** — `atomic_replace_literal` bumped
`server.ts` McpServer `version "1.0.0"→"3.0.0"` on line 153; the live sha256
guard refused a stale-hash write; `code_outline` resolved symbols on a real
file. Self-edited server still runs: tsc --strict 0 errors, smoke 43/43,
OP_EXIT=0. Reproduce: `npx tsx scripts/mcp/atomic-edit/operational-use.ts`
(and `demo-live.ts`). Committed to branch `<dev-branch>`.
NOTE: `mcp__atomic-edit__*` native tools require a fresh session (server was
registered mid-session); the production-path proof above is equivalent.

**MEASURED A/B vs line-oriented** (`benchmark.ts`, real repo files,
2026-05-15): decisive non-gameable result = syntactic efficacy **4/4
deliberately-broken edits refused pre-write** by atomic vs 0 refused by the
built-in Edit/apply_patch contract (no pre-write validation). Output-surface
reduction: typical sub-line edits 1.2–3.6× fewer chars (consistent w/
CodeStruct −12–38% tokens); block/in-function change worst-case up to ~36×;
blast radius ~4× fewer lines touched. Honest limit: this measures the
mechanical cost+safety drivers, NOT a live model Pass@1/latency A/B (that is
the cited CodeStruct evidence: +1.2–5.0% Pass@1, empty-patch 46.6%→7.2%).
Reproduce: `npx tsx scripts/mcp/atomic-edit/benchmark.ts`.

**OPENCODE PERMANENT STANDARD (2026-05-15):** atomic editing is now the
default for ALL OpenCode agents/subagents. Registered in project
`opencode.json` + global `~/.config/opencode/opencode.json` (MCP local
server); prefer-atomic operating rule in global `~/.config/opencode/AGENTS.md`
+ `instructions` key (combined into every subagent prompt; fleet `opencode
run` inherits automatically, no per-call flag). NOT a fork of OpenCode source
(would die on `opencode upgrade` — gambiarra); uses sanctioned extension
points = upgrade-proof. Runtime hardened: launcher dropped tsx/npx/network,
compiles once to `dist/` via installed `typescript` (`build.mjs`), runs
`node dist/server.js`, self-rebuilds only on source staleness; `dist/`
gitignored; `guard.ts` ESM-safe (import.meta.url). Fixed the 30s MCP-handshake
timeout (npx cold-resolve). VALIDATED: `opencode mcp list` → "✓ atomic-edit
connected"; a real `opencode run -m deepseek/deepseek-v4-pro` autonomously
called `atomic-edit_code_outline` and returned the correct symbol count.
Commits on `<dev-branch>`. To re-validate:
`opencode mcp list`.

**v4 GAP FIX — `atomic_replace_text` (2026-05-15):** the h13 PR#314 swarm
exposed a real usability leak — subagents *abandoned* the atomic suite for the
blunt builtin `edit` on multi-line/block edits ("atomic range validation is
strict… use the edit tool"); `atomic_replace_range` was used only 1× in an
8-task wave, and that builtin-`edit` fallback path is exactly where a broken
`eevent` typo slipped through with a false "clean" self-report. Root cause: no
forgiving + validated multi-line primitive (builtin edit = easy/unvalidated;
replace_range = validated/coordinate-brittle). Fix: added **`atomic_replace_text`**
(verbatim oldText→newText, uniqueness-checked, builtin-`edit` ergonomics, no
coords) routed through the same no-syntax-regression validate + atomic write +
governance guard + preview + sha guard. 15 tools now; smoke **47/47**; tsc
strict 0; `opencode mcp list ✓ connected`. Operating rule (global
~/.config/opencode/AGENTS.md + project guide + README) now MANDATES
`atomic_replace_text` over builtin edit/patch for any multi-line/block change —
closes the fallback path for me AND all OpenCode subagents. Blind re-test of
the exact failure class (multi-line whole-function replace, mission silent on
tools): subagent used `code_outline`→`atomic_edit_symbol`, **zero builtin
Edit/Write/patch**, byte-correct, parseDiagnostics 0. LESSON: a validated
primitive only multiplies if it's as ergonomic as the unsafe one; otherwise
agents rationally route around it.

**BLIND BEHAVIORAL TEST PASSED (2026-05-15):** dispatched `opencode run
-m deepseek/deepseek-v4-pro` with a mission that did NOT mention atomic/tools
("change timeoutMs to 8000; rename fetchOrder→getOrder"). Model autonomously
used `code_outline` → `atomic_replace_property_value` → `atomic_rename_symbol`,
**zero builtin Edit/Write/patch**, output byte-correct (didn't over-rename
sibling). Standard is the DEFAULT behavior with no instruction. The test also
caught a real regression: dist compilation moved guard.ts one dir deeper so
the old `../../..` REPO_ROOT became /repo/scripts (atomic calls failed → model
fell back to Edit). Fixed: guard.ts now walks up to the `.git` marker
(location-independent, src+dist); launcher REPO_ROOT corrected to `../..`.
LESSON: when compiling a tool that derives repo root from its own file path,
never count fixed `..` — anchor to a repo marker; changing run location
(src→dist) silently breaks path containment. Re-run after fix = clean.

**E8 — VISUAL + TOKEN ATOMICITY (2026-05-15, explicit Daniel instruction):**
Daniel pushed back that atomic *action* is invisible if the CLI still paints
whole-line red/green. HARD TRUTH established + recorded: disabling the native
line-level +/- TUI is **impossible** in Claude Code & Codex (closed binaries);
OpenCode only via a fork (rejected — maintenance liability). Delivered the
in-repo-possible equivalent: `advanced.ts::characterDiff` → `atomicDiff` field
(`[-removed-]{+added+}` char-level LCS, ANSI+bracket-legible) in EVERY mutating
payload, shown *beside* the unavoidable harness block. `trace.ts` =
`AtomicEditTrace` v1.0 → gitignored `docs/ai/traces/<op>.json`; verbosity L0–L3
via env `ATOMIC_EDIT_VERBOSITY`, **committed path defaults L1** (compact proof
+ trace pointer, no verbose legacy diff = real token saving on the hot path),
**preview floors L2** (full proof; preserves canonical smoke contract → ZERO
gate/test modification). `audit-atomicity.mjs` = fail-closed regression auditor
(atomic_edit_ratio min 0.85, expansion, fallback, coarse_unjustified; fixtures
filtered) — self-proven: clean→PASS, injected 13× coarse→FAIL. smoke.ts 47/47
with it all wired (one regression introduced by L1-default dropping `diff` in
preview → fixed by the preview-floors-L2 design, not by editing the test).
Untracked `smoke.mjs` 45/8 = pre-existing live-fixture failures, proven not a
regression (HEAD build = identical 45/8). **Committed locally** 3 units
(`1f3068b81`, `f5e5763dc`, `dab313706`) on <dev-branch>, all
guards green on the 6 E8 files. **PUSH BLOCKED** (objective, NOT bypassed):
`prepush:scoped`→`guard:changed-eslint` validates the whole 515-file local
backlog (origin tip far behind) → ~30+ eslint errors in concurrent-agent
backend spec.ts/frontend tsx, ZERO atomic-edit files. Refused to
--no-verify / weaken protected check / git-restore others / mass-edit 30+
concurrent files (governance + memory: don't compete on this branch).
Report-and-stop per CLAUDE.md STOP conditions. Unblock = owner pushes the
branch / concurrent agents clear their own lint debt; E8 commits ride along
clean. Docs: ATOMIC_EDIT_PROGRESS.md (E8 row + push-blocker section) +
CLI_ACTIVATION_MATRIX.md (E8 section, honest boundary table). LESSON: never
promise "proibir a TUI" — it's outside repo control; ship the additive proof
+ say so plainly (evidence rule).

**How to apply:** for TS/JS/JSON structural/sub-line edits, prefer these over
blunt `Edit`. Loop: `code_outline` → `code_read_symbol` → narrowest atomic op
(`preview:true` if unsure). Verify `npx tsx scripts/mcp/atomic-edit/smoke.ts`
(43 assertions, 0 fail, incl. live MCP round-trip + cross-file rename + sha guard).
Permanent operating doc: `docs/ai/ATOMIC_EDIT_OPERATING_GUIDE.md`. Activation:
one-time project MCP trust approval on fresh session (or `"atomic-edit"` in
this project's `enabledMcpServers` in `~/.claude.json`). Honest limits:
cross-file rename needs reachable tsconfig; non-TS/JS/JSON = range-only
validation; selectors = named declarations only. Related:
[[feedback_no_gambiarra]], [[feedback_mcp_project_approval]],
[[feedback_validate_subagent_deliveries]].
