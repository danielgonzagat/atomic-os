# Atomic OS — universal agent doctrine

> Drop this into your global agent config (`~/.config/opencode/AGENTS.md`,
> `~/.codex/AGENTS.md`, a Claude Code rule, or a `CLAUDE.md` section) so every
> session and every spawned subagent inherits it. It is the operating contract
> of the Atomic Operating System.

## The principle (non-negotiable)

Change the **smallest piece** needed to realize a **real product intention**,
**prove exactly what changed**, **preserve everything that did not need to
change**, **validate the final behavior**, **persist continuity**, and let a
non-technical person trust the result **without reading code**.

Intention high → action minimal → proof clear → rollback possible →
continuity persisted → product working as the end. Never "old line died, new
line born" when a sub-structure anchor is preservable.

## The LAW — native diff renderer banned for code

For any change to a **code** file (`.ts .tsx .js .jsx .mjs .cjs .json .py .go
.rs .java .kt .c .cpp .cs .rb .php .swift .scala .sh .css .scss .sql .yaml
.toml .prisma .ipynb` …):

**Prohibited:** native `Edit`/`Write`/`MultiEdit`/`NotebookEdit`, native
`apply_patch`, shell in-place mutation (`sed -i`, `> file.ts`, `tee` into
code, `perl -i`, heredoc into code, inline-eval writers), a line-oriented
red/green diff as the edit proof, a code file changed without a trace.

**Mandatory:** every code mutation goes through `mcp__atomic-edit__*`. The
tool returns the char-level `[-removed-]{+added+}` proof + FounderBlock and
persists the full `AtomicEditTrace`. The native TUI then shows only the tool
output.

Prose (`.md`/`.txt`) and non-edit tools (npm/git/build/grep/cat) are **not**
restricted. The law is about *code*, so the harness never renders a
whole-line +/- block for a sub-line change.

If `mcp__atomic-edit__*` is not visible, the server is not loaded for this
session: say so and start a fresh one — do **not** silently fall back to a
native or shell edit. That path is closed on purpose.

## The loop (mirror CodeStruct read→edit)

1. `code_outline <file>` — signature map, no bodies (cheap).
2. `code_read_symbol <file> <selector>` — read only the unit to change.
3. Edit with the **narrowest** operator expressing the intention
   (`atomic_replace_literal` / `atomic_replace_text` / `atomic_replace_range`
   / `atomic_edit_symbol` / `atomic_rename_symbol[_cross_file]` /
   `atomic_apply_edits` / `atomic_add_import` /
   `atomic_replace_property_value` / `atomic_transaction` …).
4. Uncertain? `preview: true` first; commit by re-calling without it.
5. Concurrent-agent risk? Pass `expectedSha256` (from your last read) so a
   stale write is refused, not silently collided.

## Governance

Files declared in `atomic-edit.protected.json` (repo root) or
`ATOMIC_EDIT_PROTECTED_FILES` are hard-refused. If a protected rule must
change, **ask a human** — never bypass, never weaken a gate, never fake
success. Honest scope: do not pretend to "win" a task you did not actually
complete; a structurally-validated edit proves structure, not behavior —
validate behavior by running the product.
