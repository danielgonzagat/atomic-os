# Atomic OS

**An MCP server that turns any AI CLI agent (Claude Code, OpenCode, Codex) from a
blunt text editor into a surgical, verifiable, universal code engineer — where
every change is the smallest faithful mutation, proven character-by-character,
validated before it's written, and reversible.**

[![tools](https://img.shields.io/badge/tools-64-E85D30)](#what-you-get--64-tools)
[![languages](https://img.shields.io/badge/structural%20edit-multi--language%20WASM-blue)](#the-universal-engine-multi-language-pure-wasm)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![smoke](https://img.shields.io/badge/smoke-11%2F11-success)](#verify-it-yourself)

---

## TL;DR — for anyone, technical or not

A normal AI coding agent edits like this: to change one word, it **rewrites the
whole line** (or the whole file), shows you a giant diff, and asks you to trust
it. If you can't read code, you can't validate it — so the promise *"you don't
need to program"* quietly becomes *"you don't need to program, but you do need to
audit programming."*

Atomic OS fixes the **action layer**. The agent now:

1. understands the **result** you want,
2. finds the **smallest piece** that must change,
3. changes **only that piece** (a literal, an argument, a symbol — even one
   character),
4. **proves** exactly what changed (a character-level diff, an sha256 before/after),
5. **validates** the result actually parses before writing it,
6. records a **trace** so another session can continue,
7. lets you **roll back**, and
8. lets you validate by the **product behaving**, not by reading the diff.

```
Factory agent:                          Atomic OS:
  rewrite the whole line   ───►           replace just "greet" → "salute"
  "trust me"                              proof: 4 chars changed, syntax ok, sha256 logged
  you must read the diff                  you validate by running the app
```

It works across **many languages**, edits **many files in one all-or-nothing
transaction**, and **refuses** any change that would break syntax or touch a file
you marked protected. Nothing is written outside that firewall.

---

## Why this is different (the honest version)

Most "AI coding" tools compete on the **model's intelligence**. Atomic OS is built
on a different, underexploited thesis:

> An AI's real autonomy isn't limited only by how well it *thinks* — it's limited
> by the **granularity, verifiability, and trustworthiness of its actions**. A
> smart model with a blunt editor still turns small intentions into large,
> risky mutations.

So this is **not** a smarter model. It's a **verified action substrate** that any
model plugs into. Three things make it genuinely ahead of the factory editor —
not hype, things you can run and check:

- **The firewall is a law, not a convention.** Every mutation flows through
  `resolve-safe-target → sha256 → syntax-validate → char-level trace → write →
  rollback`. The universal engine is forced to *dry-run*, so it **physically
  cannot write** — only the firewall writes. A bad edit is **refused**, not
  written-then-regretted.
- **Universal, by the right architecture.** Structural edit/search across **11
  first-class tree-sitter grammars** (Python, JS, TS/TSX, Go, Ruby, Rust, Java,
  C, C++, Bash, JSON) via a native tree-sitter/ast-grep engine — not a
  per-language catalog. One core, pluggable perception; drop in any
  `tree-sitter-<lang>` package to add another, and non-grammar files degrade
  cleanly to byte/range-validated edits.
- **Dominance is measurable.** A built-in **bypass-rate meter** counts every time
  the agent reaches for raw Bash/Edit when an atomic tool existed — so "better
  than the factory editor" is a number you drive toward zero, not a slogan.

**What it is NOT** (because lying would defeat the point): it does not make the
model smarter; on novel reasoning it's at parity with mainstream tools. The
components (tree-sitter, ast-grep, ts-morph, ripgrep, LSP) are existing tech — the
revolution is the **principle + the firewall + the relentless discipline of
proving every step**, not inventing the parts. On a one-character change in a
trivial file, a plain editor is just as fast. Atomic OS wins where it matters:
**structure, safety, multi-file, universality, and trust without reading code.**

---

## Install (≈ 3 minutes)

```bash
# 1. clone + build (no network at runtime, no tsx/npx; compiles once to dist/)
git clone https://github.com/danielgonzagat/atomic-os
cd atomic-os
npm install        # pulls web-tree-sitter + grammars (the self-contained universal engine; no native binary)
npm run build      # compiles src/ -> src/dist/
npm test           # 11/11 smoke: build + live handshake + a real firewall-guarded edit
```

Then wire the launcher into your AI CLI's MCP config. The server **anchors to the
nearest `.git`** of whatever project your CLI is in, so **one install serves every
project**.

**Claude Code** (`.mcp.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "atomic-edit": {
      "command": "bash",
      "args": ["/absolute/path/to/atomic-os/src/atomic-edit-mcp-launcher.sh"]
    }
  }
}
```

**OpenCode / Codex**: see [`integrations/opencode/`](integrations/opencode) and
[`integrations/codex/`](integrations/codex) for the per-CLI MCP entry + the
"prefer atomic tools" agent rule and the deny-hook that bans raw code edits.

Full setup, including the optional **deny-hook** that makes the atomic tools the
*only* way to edit code: [`docs/INSTALL.md`](docs/INSTALL.md).

---

## What you get — 64 tools

| Group | Tools (highlights) | What it gives you |
|---|---|---|
| **Content/anchor editing** | `atomic_replace_at`, `atomic_locate`, `atomic_replace_text`, `atomic_replace_literal`, `atomic_edit` (unified router) | Edit by **what to find** (content / anchor), never by line/column. Kills coordinate-math and line-drift errors. |
| **Universal structural (multi-lang)** | `atomic_ast_search`, `atomic_ast_edit`, `atomic_ast_rewrite`, `atomic_rename_symbol_universal`, `atomic_outline`, `atomic_native_status` | ast-grep search/rewrite + scope-aware rename + tree-sitter outline, in **any** language. |
| **Symbol & TS-semantic** | `atomic_edit_symbol`, `atomic_rename_symbol`, `atomic_rename_symbol_cross_file`, `atomic_add_import`, `atomic_remove_import`, `atomic_change_signature`, `atomic_add_decorator`, `atomic_add_await_to_call` | Type-aware, scope-correct refactors via ts-morph. |
| **Multi-file & semantic apply** | `atomic_transaction`, `atomic_apply_workspace_edit` | One all-or-nothing transaction across many files; apply any **LSP WorkspaceEdit** through the firewall. |
| **Read / search / outline** | `atomic_grep`, `atomic_glob`, `atomic_outline`, `code_browse`, `code_outline`, `code_read_symbol` | Native ripgrep/glob/tree-sitter — faster and more structured than shelling out. |
| **Range / anchor primitives** | `atomic_replace_range`, `atomic_insert_at`, `atomic_delete_range`, `atomic_insert_after_anchor`, `atomic_replace_between_anchors`, `atomic_apply_edits` | Precise sub-line operators (the internal compilation target). |
| **Files & governance** | `atomic_create_file`, `atomic_delete_file`, `atomic_lock_acquire/release`, `code_file_stat` | Firewall-guarded create/delete + multi-agent locks. |
| **Proof & measurement** | `atomic_bypass_report`, `truth_receipt`, `behavior_receipt`, `zero_code_trust_score` | The bypass-rate meter + trust/proof receipts. |

Run `tools/list` against the server for the full, current set.

---

## The firewall — every edit is provable

Every mutating tool, with **no exceptions**, goes through this exact sequence:

1. **`resolveSafeTarget`** — the path is contained in the repo and is **not**
   in your protected set (else: refused).
2. **`sha256` guard** — optional optimistic-concurrency check (refuse if the file
   changed under you).
3. **`validate`** — the result is parsed (TS/JSON natively; many langs via
   tree-sitter; structural-balance fallback). **A syntax-regressing edit is
   refused and never written.**
4. **char-level trace** — exactly which characters changed, sha256 before/after,
   written to `.atomic/traces/<op>.json`.
5. **atomic write** — temp-file + fsync + rename (no torn files).
6. **rollback** — the pre-edit content is the rollback source; a failed
   validation never writes, so disk is never left half-edited.

The universal native engine runs in an **isolated child process** and is forced
to `dryRun:true` — it computes spans, it never writes. So even a native crash
can't corrupt your repo, and there is no "the addon wrote something the firewall
didn't see."

---

## The universal engine (multi-language, pure WASM)

Structural search/edit/rename/outline across many languages is powered by
**[`web-tree-sitter`](https://www.npmjs.com/package/web-tree-sitter)** — the
official tree-sitter compiled to WebAssembly — plus the canonical
`tree-sitter-<lang>` grammar packages (Python, JavaScript, TypeScript/TSX, Go,
Ruby, Rust, Java, C, C++, Bash, JSON today; drop in another grammar package to
extend it). There is **no native binary and no PI dependency**: the engine is
plain WASM that runs in-process on every platform, installed by an ordinary
`npm install`. Because WASM is memory-safe it cannot crash the host, so there is
no child-process fork — the engine is in-process, not an isolated worker.

It **degrades cleanly**: if web-tree-sitter or a grammar fails to load, the
`atomic_ast_*` / `atomic_grep` / universal-rename / `atomic_outline` tools report
unavailable and **every TS/ts-morph tool keeps working fully**. Check with
`atomic_native_status`.

---

## The founding principle

> **Princípio da Ação Atômica Verificável Orientada a Produto** — the AI should
> touch the smallest piece necessary to realize a real intention, prove exactly
> what changed, preserve everything that didn't need to change, validate the
> final behavior, and let a **non-technical person trust the result without
> opening the code.**

The full doctrine (PT + EN), the hierarchy of intent, the preservation topology,
and the de-hardcode principle: [`docs/PRINCIPLE_ORIGINAL_PT.md`](docs/PRINCIPLE_ORIGINAL_PT.md)
and [`docs/OPERATING_GUIDE.md`](docs/OPERATING_GUIDE.md).

---

## Configuration — what's protected

By default **nothing** is protected (this is a generic tool). You declare your
own governance set, two ways (merged):

```bash
# env, OS-path-delimited:
export ATOMIC_EDIT_PROTECTED_FILES="CLAUDE.md:.github/workflows/ci.yml:src/lib/keys.ts"
```

```jsonc
// atomic-edit.protected.json at your repo root (see the .example):
{ "files": ["CLAUDE.md", "AGENTS.md"], "globs": ["ops/*.json", "**/*.key"] }
```

Any edit to a protected path is refused for **all** AI CLIs — only you change it.
The repo-containment boundary always applies regardless of config.

---

## Verify it yourself

```bash
npm test
#  PASS  server lists >= 60 tools (got 64)
#  PASS  tool present: atomic_replace_at / atomic_ast_edit / atomic_rename_symbol_universal / ...
#  PASS  atomic_replace_at applied      (a real content-addressed edit)
#  PASS  edit persisted (greet->salute) (in a Python file)
#  PASS  path-escape refused            (the firewall)
#  11 passed, 0 failed
```

---

## Honest limits

- It does **not** raise the model's intelligence — on novel reasoning/code-gen
  it's at parity with mainstream agents.
- On trivial one-shot edits, a plain editor is equally fast; Atomic OS dominates
  on structure, multi-file, universality, safety, and auditability.
- Type-aware refactors (scope rename with types, signature changes) are deep on
  **TS/JS** (ts-morph); other languages get **syntactic** structural edits + tree-
  sitter scope, not full type resolution.
- The universal engine is pure WASM (web-tree-sitter) — no native binary, runs
  on every platform. Languages beyond the bundled grammar set are added by
  installing the matching `tree-sitter-<lang>` package.

---

## Repository map

```
src/                     the MCP server (compiles to src/dist/)
  server.ts              entrypoint — registers all tool groups
  engine*.ts             the edit engine (apply, validate, zones, rename, universal)
  guard.ts               repo-containment + your protected-file config
  native-bridge.ts       the universal engine — web-tree-sitter (WASM), in-process
  server-tools-*.ts      the 64 tools
  server-helpers-*.ts    the firewall (commit, multi-file, io, trace, verify)
  bypass-*.mjs           the bypass-rate meter (classify / observe / report)
  trace.ts               the char-level proof ledger
  build.mjs              self-contained compiler (no tsx/npx/network)
  smoke.mjs              standalone end-to-end proof
docs/                    INSTALL, GOVERNANCE, OPERATING_GUIDE, the PRINCIPLE
integrations/            per-CLI setup (claude / opencode / codex)
atomic-edit.protected.example.json   copy → atomic-edit.protected.json
```

---

**Atomic OS** — intention high, action minimal, proof clear, rollback possible,
continuity persisted, **product as the end**. MIT licensed.
