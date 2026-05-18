# Codex Global Operating Layer

## Atomic Editing — UNIVERSAL AUTHORIAL STANDARD (mainstream banned)

This machine runs ONE shared structured-action-space tool across all CLIs
(Claude Code, Codex, OpenCode): the `atomic-edit` MCP server
(`/Users/danielpenin/whatsapp_saas/scripts/mcp/atomic-edit-mcp-launcher.sh`),
registered for Codex in `~/.codex/config.toml` `[mcp_servers.atomic-edit]`.
Its tools appear as `atomic-edit__*` (READ: `code_browse`/`code_outline`/
`code_read_symbol`; EDIT: `atomic_replace_text`/`replace_range`/`insert_at`/
`delete_range`/`apply_edits`/`replace_literal`/`edit_symbol`/`rename_symbol`/
`rename_symbol_cross_file`/`add_import`/`remove_import`/
`replace_property_value`). Every mutating op is syntax-regression validated,
atomic-written, governance-guarded, with `preview`/`expectedSha256`.

**The coarse mainstream model is BANNED for code.** Do NOT default to the
builtin line/`apply_patch`/`str_replace` editor for any TS/JS/JSON change.
Loop: `code_outline` → `code_read_symbol` → highest faithful operator
(`atomic_replace_text` for any multi-line/block change — same ergonomics as
the builtin, no coordinates — `atomic_edit_symbol` for a whole symbol,
`atomic_replace_literal`/`replace_property_value`/`add_import` for micro-
intentions, `rename_symbol[_cross_file]` for renames; `preview:true` if
unsure). Line/block/file patching is fallback ONLY for genuinely line/block/
file-level non-code changes. Keep repository governance, protected-file rules,
validation, and non-destructive git discipline intact (never `git restore`).

The standalone `~/.codex/bin/semantic-edit` / `atomic-edit.mjs` are now an
**offline fallback only** (use when the shared MCP is unreachable); the shared
MCP `atomic-edit` is the primary, so behavior is identical across all three
CLIs.

## Atomic Editing Operating Doctrine

**HARD PRECEDENCE (overrides every phrasing below):** the shared MCP
`atomic-edit__*` tools are the DEFAULT and ONLY first-choice editor for code.
Read via `atomic-edit__code_outline`/`code_read_symbol`; edit via
`atomic-edit__atomic_replace_text` (any multi-line/block — builtin-edit
ergonomics, no coordinates), `atomic_edit_symbol`, `atomic_replace_literal`,
`atomic_replace_property_value`, `add_import`/`remove_import`,
`rename_symbol[_cross_file]`. The builtin `apply_patch`/line editor and the
legacy local `semantic-edit`/`atomic-edit.mjs` are NOT defaults — use the
legacy local CLIs ONLY if `codex mcp get atomic-edit` shows the server
unreachable. Where steps below say "semantic-edit"/"atomic-edit", read it as
the shared MCP `atomic-edit__*` equivalent.

Persist this as the default software-construction posture for Codex sessions on
this machine:

1. The validated improvement is not "character edits at all costs"; it is the
   hierarchy `semantic/AST/symbol -> exact occurrence/range -> line patch`.
2. Use `semantic-edit outline` and `semantic-edit read-symbol` before editing
   non-trivial TS/TSX so the target is addressed by symbol, not guessed line
   coordinates.
3. Use semantic operations for common micro-intentions: add/remove named import,
   replace object property value, replace literal, edit/remove/insert-after a
   named symbol, scope-correct rename, and cross-file TypeScript rename.
4. Use `atomic-edit` for exact occurrence and coordinate range edits only when
   semantic selection is unavailable or unnecessarily heavy. Prefer
   `--dry-run`, `--expected-count`, `--expect`, and `--sha256` guards.
5. Treat raw line/block patching as fallback for naturally line/block/file-level
   changes, not as the default for microscopic code intentions.
6. Character/range-level power without semantic addressing is dangerous: a
   wrong coordinate can still break syntax. Always validate after writing and
   repair forward.

Local validation on 2026-05-15 showed the atomic/semantic layer is operationally
better than line-oriented editing for this machine's Codex workflow: 43/43 MCP
smoke tests passed in the repo implementation, the tool self-edited through the
production launcher path, stale `sha256` writes were refused, and a controlled
A/B benchmark showed 0/4 syntax-breaking edits reached disk under atomic
validation versus 4/4 under a line-oriented no-prewrite-validation model. Common
sub-line edits used about 1.2x-3.6x less output surface, with larger gains for
block/symbol edits. This is N3 evidence from real repo execution, not N4+ user
adoption proof.

Quick health check for future Codex sessions:

```sh
/Users/danielpenin/.codex/skills/atomic-code-editing/scripts/smoke-atomic-code-editing.mjs
```

It validates the standalone Codex CLIs without relying on repo MCP tools:
structured read, literal/property/import/symbol edits, local and cross-file
rename, exact occurrence replacement, and stale `sha256` refusal.
