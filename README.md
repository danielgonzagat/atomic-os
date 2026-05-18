# Atomic OS

**A structured-read + atomic-edit MCP server that turns any AI CLI agent
(Claude Code, OpenCode, Codex) from a blunt text editor into a surgical,
verifiable, product-oriented engineer.**

> Intention high → action minimal → proof clear → rollback possible →
> continuity persisted → **product working as the end.**

This repository is a self-contained package of the "Atomic Operating System":
the MCP server itself, the enforcement hooks, the founding doctrine, and the
complete written history of how it was evolved and proven — round by round —
to be measurably superior to a normal CLI agent on the benchmarks that matter.

If you are an AI reading this to understand the system: read this file, then
`docs/PRINCIPLE_ORIGINAL_PT.md` (the founding doctrine, verbatim), then
`docs/knowledge/` (everything we know, including the full A/B evolution loop),
then `docs/OPERATING_GUIDE.md` (how to actually operate the tools).

---

## 1. The problem it solves — the Line-Oriented Action Bottleneck

Mainstream AI CLIs promise to *build software*, but they still operate as
**coarse text editors**. They delete whole lines, rewrite whole blocks,
rewrite whole files, emit giant diffs, and ask a human to trust the diff.

This is not a model-intelligence problem. It is an **action-space** problem.
Autonomy is bounded not by model IQ but by the **granularity, verifiability
and reliability of the actions the agent can take**. A microscopic intention
("swap one literal", "rename one binding", "change one function body") becomes
a macroscopic patch → diff noise, artificial multi-agent merge conflicts,
silent drift, blind edits, unreviewable changes, and a non-technical owner who
*cannot trust the result without reading code*.

This bottleneck is independently confirmed by the research literature:
**CodeStruct** (Amazon, arXiv 2604.05407 — removing structured read costs
−7.8pp Pass@1 and makes `str_replace` 7.8× more brittle), *To Diff or Not to
Diff?* (arXiv 2604.27296), the Aider edit-format study, Diff-XYZ, and Kiro's
program-analysis argument.

**Atomic OS is the fix**, shipped as an MCP server exposing a structured
read + atomic-edit action space as `mcp__atomic-edit__*` tools.

---

## 2. The founding principle

**Princípio da Ação Atômica Verificável Orientada a Produto**
(*Principle of Verifiable, Product-Oriented Atomic Action*) — plus its
corollary, **Princípio da Preservação Máxima com Mutação Mínima**
(*Maximum Preservation with Minimal Mutation*).

> An AI must change the **smallest piece** needed to realize a **real product
> intention**, **prove exactly what changed**, **preserve everything that did
> not need to change**, **validate the final behavior**, **persist
> continuity**, and let a **non-technical person trust the result without
> reading code.**

In plain language — *the AI must not replace a part by tearing down the whole
wall.* It must:

1. understand what result the human wants;
2. discover the minimal part that must change;
3. touch only that part;
4. show exactly what changed;
5. prove nothing important broke;
6. record what it did;
7. allow continuation by another session/agent;
8. let the human validate via the **product**, not the code.

The full, canonical doctrine (≈2,600 lines, in Portuguese, as ratified by the
owner) is preserved verbatim in **`docs/PRINCIPLE_ORIGINAL_PT.md`**. It is the
constitution of this system; the code is its implementation.

### Hierarchy of intent

Pick the **highest** operator that expresses the intention; execute at the
**lowest** granularity that is faithful and damage-free:

```
product / behavior
  → change intention
    → multi-file transaction
      → catalogued refactor
        → semantic operation
          → symbol
            → structural node
              → range
                → char
                  → byte
```

Never "old line died, new line born" when a sub-structure anchor is
preservable.

### Preservation topology — classify BEFORE editing

(1) preserved anchors, (2) modified zones, (3) movement zones,
(4) wrapper/context, (5) behavior changed?, (6) public contract changed?,
(7) which validation is required (syntax | type | test | real behavior).
25 canonical topologies are catalogued in `docs/knowledge/01-action-principle.md`.

### De-hardcode principle

Atomic OS carries **fixed LAWS, not fixed SOLUTIONS**. Zero *operational*
hardcode (prompt / operator / scope / validation / fast-path / topology /
budget are all dynamic), but **mandatory *invariant* hardcode**: no protected
touch, no bypass, no faked success, always trace, always rollback-able. See
`docs/knowledge/02-dehardcode-principle.md`.

---

## 3. The action space (what the tools actually are)

The server exposes ~40 tools under the `mcp__atomic-edit__*` namespace, in two
families. Every mutating op is **syntax-regression-validated** (it refuses to
persist code that introduces a new syntax error), **atomically written**
(temp + fsync + rename; batches and cross-file renames are all-or-nothing),
**governance-guarded**, **optimistic-concurrency-safe** (`expectedSha256`),
and emits a **char-level proof** + an **AtomicEditTrace** to `docs/ai/traces/`.

**READ (CodeStruct read→edit; the dominant accuracy lever):**

- `code_browse`, `code_outline`, `code_outline_batch` — token-cheap structural
  maps (signatures, ranges, no bodies).
- `code_read_symbol` — read only the unit you will change, with its exact
  range returned.
- `code_file_stat`, `continuity_status`, `behavior_receipt`, `truth_receipt`,
  `zero_code_trust_score`, `product_intent_contract` — verification surface.

**EDIT (narrowest operator that expresses the intention):**

- one literal → `atomic_replace_literal`
- a verbatim block → `atomic_replace_text` (builtin-`edit` ergonomics, but
  validated + atomic + guarded)
- a span / token / sub-expression → `atomic_replace_range`,
  `atomic_insert_at`, `atomic_delete_range`, `atomic_wrap_range`
- several sites, one intention → `atomic_apply_edits` (LSP `TextEdit[]`)
- a whole function/class/method → `atomic_edit_symbol`
  (`replace` | `insert_after` | `remove`)
- rename in-file → `atomic_rename_symbol`; project-wide →
  `atomic_rename_symbol_cross_file` (tsconfig language service: covers
  `jest.mock`, `require`, NestJS DI providers, …)
- imports → `atomic_add_import` / `atomic_remove_import` (deduped, comma-safe)
- object property → `atomic_replace_property_value` /
  `atomic_rename_property_key`
- file-level → `atomic_create_file` / `atomic_delete_file`
- multi-step single intention → `atomic_transaction`
- await/async fixups → `atomic_add_await_to_call`
- dry-run anything → `preview: true` (validated diff, writes nothing)

Every mutation reports an **Expansion Factor** (`intentionChars` vs
`lineRewriteSurfaceChars`) so the bottleneck stays *measurable*, and a
**FounderBlock** (`whatChanged` / `whatPreserved` / `howToValidate` /
`notProven` / `zeroCodeTrust`) so a non-technical owner can trust the result
without reading code.

Full operating loop and per-tool guidance: **`docs/OPERATING_GUIDE.md`** and
the source reference **`src/README.md`**.

---

## 4. The LAW — native diff renderer is banned for code

The native CLI stays as the chat/orchestration shell. The native
**edit/diff renderer is banned for code**: the only thing that may appear on
screen when code changes is the atomic tool's char-level proof.

Prohibited for code: native `Edit`/`Write`/`MultiEdit`/`NotebookEdit`, native
`apply_patch`, shell in-place mutation (`sed -i`, `> file.ts`, `tee`,
`perl -i`, heredoc into code, inline-eval writers…), line-oriented red/green
diff as edit proof, a code file changed without an `AtomicEditTrace`.

Mandatory: every code mutation via `mcp__atomic-edit__*`; the tool returns the
compact human summary + persists the full trace; the TUI shows only the tool
output; session-end coverage audit flags any code change with no trace.

Prose (`.md`/`.txt`) and non-edit tools (npm/git/build/grep/cat) are **not**
blocked — the law is about *code*. This package ships the enforcement hook
(`src/atomic-only-hook.mjs`) and the trace/coverage auditors
(`src/trace-coverage-audit.mjs`, `src/audit-atomicity.mjs`,
`src/worker-scope-check.mjs`). Wiring per CLI is in `docs/INSTALL.md`.

This package was itself assembled under this law — `guard.ts`, the launcher,
`package.json`, `tsconfig.json` and the protected-config example were all
created through `mcp__atomic-edit__atomic_create_file`, never a shell heredoc.
The atomic OS packaged itself with itself.

---

## 5. How it was proven — the A/B evolution loop (zero → victory)

Atomic OS was not designed and shipped; it was **evolved against a control**.
A permanent Atomic-vs-Normal A/B self-improvement harness pits the atomic
agent against a "normal" CLI agent on real, escalating software tasks. The
rule of the loop: *every iteration that updates the atomic OS must move it
measurably closer to the founding principle, and atomic must become provably
much superior to the normal agent on every benchmark that matters* — never on
trivial ones (anti-overfit: escalate only on two consecutive valid,
huge-margin discriminating wins; never grind non-discriminating tiers).

**Result, at the time of packaging (55+ discriminating rounds, 189 round
directories of evidence):** atomic won **all** discriminating tiers —

- **L2** symbol rename ×2 (margin 1.5–1.7)
- **L4** 14-site security rename ×2 (1.83–1.95)
- **L5** 72-caller max-scale `.log` rename ×2 (2.53 / 1.86; turns 4.2–5.7×
  fewer). Normal *drowns*: 147–178 turns / 16 edit-failures vs atomic
  31–35 turns / 0 failures.
- L1 + L3 are non-discriminating *by doctrine* — honest scope means Normal is
  allowed to win benign micro-tasks; Atomic does not cheat to "win" those.

32+ generalizable upgrades were absorbed into the OS this way (selector +
complete-reference rename incl. `jest.mock`/`require`/NestJS-DI, intention
`atomic_transaction`, minimal-diff edit, convergent decompose, airtight
no-shell-write kernel, parallel + incremental + delta-tsc `atomic_verify`…).
A core finding ("Normal as teacher"): every time Normal wins by brute force,
that brute advantage is converted into a *safe atomic macro* — absorbing the
advantage without the defect.

The **complete, unabridged round-by-round history and current resume state**
is preserved in **`docs/knowledge/04-ab-evolution-loop.md`** (the full project
memory, ~135 KB). First-round raw evidence is in `docs/evidence/`. This is
"tudo que sabemos sobre o loop de evolução e vitória" — kept whole, not
summarized, on purpose.

---

## 6. Install (any project, any of the three CLIs)

Prerequisites: Node ≥ 20, `git`, and the npm deps installed once.

```sh
git clone https://github.com/danielgonzagat/atomic-os.git
cd atomic-os
npm install          # @modelcontextprotocol/sdk, ts-morph, typescript, zod
npm run build        # compiles src/ → src/dist/ (also auto-builds on launch)
npm run smoke        # self-validating regression suite — expect 0 failed
```

The server operates on **whatever git repo is the current working directory
when your CLI launches it** (`guard.ts` anchors to the nearest `.git`), so one
install serves every project. Point your CLI's MCP config at
`src/atomic-edit-mcp-launcher.sh`. Exact snippets for **Claude Code**,
**OpenCode** and **Codex** are in **`docs/INSTALL.md`**.

Define what is off-limits in the target repo (optional but recommended):
copy `atomic-edit.protected.example.json` → `atomic-edit.protected.json` at
that repo's root, or set `ATOMIC_EDIT_PROTECTED_FILES`. See
**`docs/GOVERNANCE.md`**. Shipped default: protected set is **empty** — only
the path-escape boundary is enforced until you declare your own.

---

## 7. Repository map

```
src/                       the Atomic OS itself
  server.ts                MCP server — ~40 tools wired
  engine.ts                atomic edit engine (validate + atomic write)
  nav.ts symbols.ts        structured read (CodeStruct readCode)
  advanced.ts trace.ts     advanced ops + AtomicEditTrace
  textunit.ts founder.ts   text-unit model + FounderBlock proof
  guard.ts                 governance + path-escape boundary (configurable)
  build.mjs                no-network self-build (typescript only)
  atomic-edit-mcp-launcher.sh  the launcher to wire into MCP config
  smoke.ts smoke.mjs       self-validating regression suite
  atomic-only-hook.mjs     PreToolUse enforcement (native diff banned)
  trace-coverage-audit.mjs audit-atomicity.mjs worker-scope-check.mjs
docs/
  PRINCIPLE_ORIGINAL_PT.md the founding doctrine, verbatim (constitution)
  OPERATING_GUIDE.md       how to operate the tools each session
  INSTALL.md               per-CLI MCP wiring (Claude/OpenCode/Codex)
  GOVERNANCE.md            how to declare your own protected files
  knowledge/               everything we know (incl. full A/B loop history)
  evidence/                first-round raw Atomic-vs-Normal benchmark logs
atomic-edit.protected.example.json   copy → your repo root to set governance
```

---

## 8. Honest limits

- Cross-file rename needs a reachable `tsconfig.json` (falls back to a
  directory-scoped project otherwise).
- Non-TS/JS/JSON: range/insert/delete work; validation is range-validity only.
- Selectors resolve named declarations; arbitrary sub-expression selectors are
  a future layer, **not faked**.
- An edit tool proves *structure + exact scope*, **not product behavior**.
  `zeroCodeTrust` ceilings at 60 for a structurally-validated edit; reaching
  75 (validate by explanation) or 100 (validate by the product) requires
  running the changed flow in the actual app. The system is honest about this
  by construction — that honesty is the point.

---

*Built and evolved by Daniel Gonzaga. Packaged by the Atomic OS, with the
Atomic OS, under the Atomic OS law. MIT licensed.*
