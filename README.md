# Atomic OS

**An MCP server that turns any AI CLI agent (Claude Code, OpenCode, Codex) from a
blunt text editor into a surgical, verifiable, universal code engineer — where
every change is the smallest faithful mutation, proven character-by-character,
validated before it's written, reversible, and where destroying correct bytes
requires a written proof.**

[![tools](https://img.shields.io/badge/tools-83-E85D30)](#what-you-get--83-tools)
[![languages](https://img.shields.io/badge/structural%20edit-multi--language%20WASM-blue)](#the-universal-engine-multi-language-pure-wasm)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![smoke](https://img.shields.io/badge/smoke-20%2F20-success)](#verify-it-yourself)
[![benchmark](https://img.shields.io/badge/AtomicBench-98%25%20bytes%20avoided%20vs%20line-E85D30)](docs/BENCHMARK.md)

> This is the **complete** Atomic OS — the full engine we run in production,
> generalized for any repo: 83 tools, the universal multi-language engine, the
> write firewall, transactional sessions, guarded command execution, the
> byte-positivity law, and the proof/convergence governance layer.

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
7. lets you **roll back** (per edit, or a whole multi-edit **session**), and
8. cannot **destroy correct bytes** without first stating *why* they were wrong.

```
Factory agent:                          Atomic OS:
  rewrite the whole line   ───►           replace just "greet" → "salute"
  "trust me"                              proof: 4 chars changed, syntax ok, sha256 logged
  you must read the diff                  you validate by running the app
```

It works across **many languages**, edits **many files in one all-or-nothing
transaction**, opens **named transactional sessions** you can roll back as a unit,
runs **guarded commands** (git/tests) inside the same trace envelope, and
**refuses** any change that would break syntax, escape the repo, or touch a file
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
model plugs into. Five things make it genuinely ahead of the factory editor —
not hype, things you can run and check:

- **The firewall is a law, not a convention.** Every mutation flows through
  `resolve-safe-target → sha256 → syntax-validate → char-level trace → write →
  rollback`. The universal engine is forced to *dry-run*, so it **physically
  cannot write** — only the firewall writes. A bad edit is **refused**, not
  written-then-regretted.
- **Byte-positivity (no-bypass).** Bytes that already exist are treated as
  *correct-by-construction*: an edit that **removes or overwrites** them is a
  *negative action* and is **refused unless you supply a written
  `proofOfIncorrectness`** (≥20 chars) explaining why those bytes are wrong.
  Additive, correctness-increasing edits flow freely. This makes "the agent
  quietly deleted my code" structurally impossible. (See the law below.)
- **Universal, by the right architecture.** Structural edit/search across **11
  first-class tree-sitter grammars** (Python, JS, TS/TSX, Go, Ruby, Rust, Java,
  C, C++, Bash, JSON) via a native tree-sitter/ast-grep engine — not a
  per-language catalog. Non-grammar files degrade cleanly to byte/range-validated
  edits; drop in any `tree-sitter-<lang>` package to add a language.
- **The coarse editor is banned for code.** The optional deny-hook makes the
  atomic tools the *only* way to touch code — the blunt full-file/whole-line text
  editor (and any raw `sed`/overwrite) is refused for source.
- **Dominance is measurable.** A built-in **bypass-rate meter** counts every time
  the agent reaches for raw Bash/Edit when an atomic tool existed — so "better
  than the factory editor" is a number you drive toward zero, not a slogan.

**What it is NOT** (because lying would defeat the point): it does not make the
model smarter; on novel reasoning it's at parity with mainstream tools. The
components (tree-sitter, ast-grep, ts-morph, ripgrep, LSP) are existing tech — the
revolution is the **principle + the firewall + the byte-positivity law + the
relentless discipline of proving every step**, not inventing the parts. On a
one-character change in a trivial file, a plain editor is just as fast. Atomic OS
wins where it matters: **structure, safety, multi-file, universality, and trust
without reading code.**

---

## The byte-positivity law (no-bypass)

The strongest guarantee in Atomic OS, and the one you'll notice first:

> **Existing bytes are correct until proven otherwise.** Any tool whose net
> effect *removes* or *overwrites* existing content is a **negative byte action**
> and is **refused** unless the call carries a `proofOfIncorrectness` string
> (≥20 chars) naming why those bytes are wrong. Purely **additive** edits
> (inserts, new files, correctness-increasing changes) need no proof.

In practice:

```jsonc
// refused — overwriting "greet" destroys correct-by-construction bytes:
{ "name": "atomic_replace_at",
  "arguments": { "file": "m.py", "mode": "content", "anchor": "greet", "newText": "salute", "occurrence": 1 } }
// → "refused: negative byte action; provide proofOfIncorrectness (>=20 chars)…"

// allowed — the same edit, justified:
{ "name": "atomic_replace_at",
  "arguments": { "file": "m.py", "mode": "content", "anchor": "greet", "newText": "salute", "occurrence": 1,
                 "proofOfIncorrectness": "\"greet\" is the wrong verb for this API; the contract specifies \"salute\"." } }
// → applied, with the proof recorded in the trace.
```

This is what makes an autonomous agent safe to let run: it can *add* and *fix*
freely, but it can't *erase* your working code without leaving a justification on
the record. The convergence/proof tools (below) build on this.

---

## Install (≈ 3 minutes)

```bash
# 1. clone + build (no network at runtime, no tsx/npx; compiles once to dist/)
git clone https://github.com/danielgonzagat/atomic-os
cd atomic-os
npm install        # pulls web-tree-sitter + grammars (the self-contained universal engine; no native binary)
npm run build      # compiles src/ -> src/dist/ and records the build manifest
npm test           # 20/20 smoke: build + live handshake + a proven edit + a transactional session
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
"prefer atomic tools" agent rule and the **deny-hook that bans raw code edits**.

Full setup, including the optional deny-hook: [`docs/INSTALL.md`](docs/INSTALL.md).

---

## What you get — 83 tools

| Group | Tools (highlights) | What it gives you |
|---|---|---|
| **Content/anchor editing** | `atomic_replace_at`, `atomic_locate`, `atomic_replace_text`, `atomic_replace_literal`, `atomic_edit` (unified router) | Edit by **what to find** (content / anchor), never by line/column. Kills coordinate-math and line-drift errors. |
| **Universal structural (multi-lang)** | `atomic_ast_search`, `atomic_ast_edit`, `atomic_ast_rewrite`, `atomic_rename_symbol_universal`, `atomic_outline`, `atomic_native_status` | ast-grep search/rewrite + scope-aware rename + tree-sitter outline, in **any** language. |
| **Symbol & TS-semantic** | `atomic_edit_symbol`, `atomic_rename_symbol`, `atomic_rename_symbol_cross_file`, `atomic_add_import`, `atomic_remove_import`, `atomic_change_signature`, `atomic_add_decorator`, `atomic_add_await_to_call` | Type-aware, scope-correct refactors via ts-morph. |
| **Multi-file & semantic apply** | `atomic_transaction`, `atomic_apply_workspace_edit` | One all-or-nothing transaction across many files; apply any **LSP WorkspaceEdit** through the firewall. |
| **Transactional sessions** | `atomic_session_begin`, `atomic_session_savepoint`, `atomic_session_rollback`, `atomic_session_commit` | A **named multi-tool window**: snapshot → many edits → **roll back or commit as one unit**, with named savepoints. |
| **Guarded execution** | `atomic_exec` | Run git / npm / tests inside the **same containment + trace + secret-redaction** envelope as edits — with an invariant denylist (no `git restore`, no `--no-verify`, no force-push). |
| **Read / search / perception** | `atomic_grep`, `atomic_glob`, `atomic_outline`, `atomic_grep_calls`, `atomic_read_file`, `code_browse`, `code_outline`, `code_read_symbol` | Native ripgrep/glob/tree-sitter + AST-accurate call-site search + guarded reads. |
| **Range / anchor primitives** | `atomic_replace_range`, `atomic_insert_at`, `atomic_delete_range`, `atomic_insert_after_anchor`, `atomic_replace_between_anchors`, `atomic_apply_edits` | Precise sub-line operators (the internal compilation target). |
| **Convergence & proof** | `atomic_converge`, `atomic_prove`, `atomic_seal`, `atomic_y_certificate` | Commit a mutation **only if it converges green across every gate**; mint gate-sourced proof receipts and an honest universal-admission certificate. |
| **Byte-positive materialization** | `atomic_positive_bytes_begin`, `atomic_positive_bytes_append`, `atomic_positive_bytes_commit` | Build up new content as a stream of **verified positive-byte** chunks. |
| **Perception & repair** | `atomic_lens`, `atomic_scan_bytes`, `atomic_repair_scope` | Whole-scope red-set of every applicable gate; positive/negative byte map; resolve-or-dangle auto-repair. |
| **Self-extension** | `atomic_expand_self` | Extend the engine itself, only under self-expansion admission + proof. |
| **Files & governance** | `atomic_create_file`, `atomic_delete_file`, `atomic_lock_acquire/release`, `code_file_stat` | Firewall-guarded create/delete + multi-agent locks. |
| **Proof & measurement** | `atomic_bypass_report`, `truth_receipt`, `behavior_receipt`, `zero_code_trust_score`, `product_intent_contract`, `continuity_status` | The bypass-rate meter + trust/proof/continuity receipts. |

Run `tools/list` against the server for the full, current set (83 tools).

---

## The firewall — every edit is provable

Every mutating tool, with **no exceptions**, goes through this exact sequence:

1. **`resolveSafeTarget`** — the path is contained in the repo and is **not** in
   your protected set (else: refused).
2. **byte-positivity gate** — if the action removes/overwrites existing bytes and
   no `proofOfIncorrectness` is supplied, it is **refused** (see the law above).
3. **`sha256` guard** — optional optimistic-concurrency check (refuse if the file
   changed under you).
4. **`validate`** — the result is parsed (TS/JSON natively; many langs via
   tree-sitter; structural-balance fallback). **A syntax-regressing edit is
   refused and never written.**
5. **char-level trace** — exactly which characters changed, sha256 before/after,
   written to `.atomic/traces/<op>.json` (the proof + the rollback source).
6. **atomic write** — temp-file + fsync + rename (no torn files).
7. **rollback** — a failed validation never writes; a whole **session** can be
   rolled back to its opening snapshot or any savepoint.

The universal engine runs **dry-run only** — it computes spans, it never writes.
So even an engine fault can't corrupt your repo. A runtime **dist-freshness**
check refuses to operate on a stale build, so the running server always matches
its source.

---

## The universal engine (multi-language, pure WASM)

Structural search/edit/rename/outline is powered by
**[`web-tree-sitter`](https://www.npmjs.com/package/web-tree-sitter)** — the
official tree-sitter compiled to WebAssembly — plus the canonical
`tree-sitter-<lang>` grammar packages (Python, JavaScript, TypeScript/TSX, Go,
Ruby, Rust, Java, C, C++, Bash, JSON today). There is **no native binary**: the
engine is plain WASM that runs in-process on every platform, installed by an
ordinary `npm install`.

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
The repo-containment boundary always applies. To pin the repo root explicitly
(e.g. in CI), set `ATOMIC_EDIT_REPO_ROOT`.

---

## Verify it yourself

```bash
npm test
#  PASS  server lists >= 60 tools (got 83)
#  PASS  tool present: atomic_replace_at / atomic_ast_edit / atomic_rename_symbol_universal / ...
#  PASS  atomic_replace_at applied              (a negative-byte edit, allowed via proofOfIncorrectness)
#  PASS  edit persisted (greet->salute)
#  PASS  path-escape refused                    (the firewall)
#  PASS  atomic_session_begin returns a session id
#  PASS  edit inside session applied (salute->hail)
#  PASS  atomic_session_rollback restored the window (hail->salute)
#  PASS  atomic_session_commit kept the edit (salute->hail)
#  20 passed, 0 failed
```

Every check runs the **live MCP server** in an isolated temp workspace — no host
monorepo, no mocks. The edit checks exercise the byte-positivity law (a negative
edit is allowed only with proof); the session checks prove the transactional
window really snapshots, rolls back, and commits.

---

## AtomicBench — measured, not claimed

```bash
npm run bench        # build + run the live suite; add --md to (re)write docs/BENCHMARK.md
```

Runs the live server against a 6-language correction suite and **measures** the
bytes Atomic OS actually changed vs the bytes a line-rewrite (what a line editor
touches) and a file-rewrite (what a "rewrite-and-trust" agent re-emits) would
have changed for the *same* edit — baselines computed, not asserted:

| | Atomic | Line-rewrite | File-rewrite |
|---|--:|--:|--:|
| bytes changed (6 single-token corrections: py/js/ts/go/rust/java) | **6** | 332 | 645 |
| **expansion avoided** | — | **98.2%** | **99.1%** |

Plus a safety suite that must be all-refused: negative-byte edit without proof →
refused; path escape → refused; syntax-breaking edit → refused; every applied
edit left a replayable trace. Full table + method: [`docs/BENCHMARK.md`](docs/BENCHMARK.md).

---

## The proof chain — semantic git for agents

Every mutation appends a tamper-evident, content-addressed trace to
`.atomic/traces/`, chained through `.atomic/HEAD`
(`chainHash = sha256(parentSha256 ‖ afterSha256 ‖ canonicalJSON(gateVerdict))`).
The `atomic` CLI reads that chain:

```bash
atomic init [--force]           # detect the repo + generate plug-and-play governance config
atomic verify [<opId>|--head]   # recompute the chain hash + check the file is still in the recorded state
atomic explain <opId>           # intention, proof/audit block, char diff, gate verdict — human-readable
atomic log [-n N]               # walk the proof chain, newest -> oldest
atomic compare                  # run AtomicBench (atomic vs line/file rewrite)
```

`atomic init` detects your languages, package manager, test command, and CI, then
writes `atomic-edit.protected.json` (sane defaults: lockfiles, `.env*`, keys,
`.github/workflows`) + `atomic.agent-rules.md` (the operating law: atomic-only
edits, byte-positivity, validate-by-product) + prints the MCP config snippet — so
any repo is governed in one command.

`verify` recomputes the **same** hash the engine wrote — tamper with the parent
pointer, the after-content, or the admitting gate verdict and it stops matching.
`replay`/`undo` are honest about scope: traces are **proof artifacts, not content
snapshots**, so live reversal is `atomic_session_rollback`; cold replay/undo is a
planned opt-in content layer (it will never invent content).

---

## MCP trust firewall — defend against tool poisoning

The MCP ecosystem's own attack surface is tool descriptors: poisoning, schema
shadowing, rug pulls, parasitic chaining. `atomic mcp` pins them:

```bash
atomic mcp scan      [--cmd "<server>"]   # capability manifest: sha256(name ‖ description ‖ schema) per tool
atomic mcp approve   [--cmd "<server>"]   # freeze the current descriptors as approved (.atomic/mcp-approved.json)
atomic mcp verify    [--cmd "<server>"]   # re-scan + diff vs approved — GREEN or RED, exit 2 on drift
```

`verify` flags every **CHANGED** descriptor (poisoning / schema-shadowing),
**ADDED** unapproved tool (parasitic chaining), and **REMOVED** tool (rug pull) —
so a server whose tools silently mutated between sessions fails the gate before
your agent trusts it. Defaults to auditing this server; point `--cmd` at any MCP
server to audit it.

---

## Product-intent gate — did the change stay in scope?

Declare the *product* intent of a change in `atomic.intent.json`:

```jsonc
{ "goal": "improve PIX checkout",
  "touch": ["src/checkout/**", "src/payments/pix/**"],
  "preserve": ["src/payments/card/**", "src/affiliates/**", "**/*.lock"],
  "verify": "npm test" }
```

```bash
atomic intent check [--base <ref>] [--run]
```

It diffs the working tree against the base and gates the change against the
promise: every changed file must be matched by `touch[]` and **none** may match
`preserve[]`. A change that edits a protected path (e.g. touches the card flow
while "only improving PIX") is **RED** (exit 2), naming the violation; `--run`
also runs the declared `verify` command. The agent doesn't just compile — it
proves it preserved the rest of the product.

---

## Honest limits

- It does **not** raise the model's intelligence — on novel reasoning/code-gen
  it's at parity with mainstream agents.
- On trivial one-shot edits, a plain editor is equally fast; Atomic OS dominates
  on structure, multi-file, universality, safety, and auditability.
- Type-aware refactors are deep on **TS/JS** (ts-morph); other languages get
  **syntactic** structural edits + tree-sitter scope, not full type resolution.
- The byte-positivity law is strict by design: an agent (or you) must justify any
  edit that removes existing bytes. That's the point — but it means destructive
  edits need a one-line `proofOfIncorrectness`.

---

## Repository map

```
src/                     the MCP server (compiles to src/dist/)
  server.ts              entrypoint — registers all 83 tools across the groups
  engine*.ts             the edit engine (apply, validate, zones, rename, universal)
  guard.ts               repo-containment + your protected-file config
  native-bridge.ts       the universal engine — web-tree-sitter (WASM), in-process
  server-tools-*.ts      the tool groups (edit, session, exec, converge, lens, y, self, …)
  server-helpers-*.ts    the firewall (commit, multi-file, io, trace, verify, effect/session)
  gates/                 the convergence/proof gate lattice (perception, contract, algebra, …)
  dist-freshness.mjs     the runtime stale-build guard + build manifest
  build.mjs              self-contained compiler (no tsx/npx/network)
  smoke.mjs              standalone end-to-end proof (20/20)
docs/                    INSTALL, GOVERNANCE, OPERATING_GUIDE, the PRINCIPLE
integrations/            per-CLI setup (claude / opencode / codex)
atomic-edit.protected.example.json   copy → atomic-edit.protected.json
```

---

**Atomic OS** — intention high, action minimal, proof clear, rollback possible,
bytes positive, continuity persisted, **product as the end**. MIT licensed.
