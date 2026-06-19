# Artifact Evaluation: Reproducing All Claims

This document enables artifact evaluation committee members to independently
reproduce every machine-checked claim in the paper. All commands are designed
for a clean checkout with zero manual intervention.

---

## 1. System Requirements

| Dependency | Minimum Version | Purpose |
|---|---|---|
| Node.js | ≥ 20 | Build + runtime + smoke + paradigm-verify |
| npm | ≥ 9 | Package installation |
| Python 3 | ≥ 3.10 | Z3 theorem proving |
| `pip` + `z3-solver` | latest | Z3 SMT solver (auto-installed by script) |
| Lean 4 (via `elan`) | ≥ 4.0 | N-way induction proof |
| git | any | Clone + blame tests |
| Docker (optional) | any | Containerized reproduction |

**Note:** Python and Lean are *optional* for the full 21-gate suite — gates that
require absent provers are honestly skipped (reported as SKIP, not faked green).
The committed proof artifacts (`confluence_z3.py`, `nway_induction_z3.py`,
`NwayConfluence.lean`) carry their own verification records from authoring time.

---

## 2. Quick Start — Docker (One Command)

The simplest reproduction path uses the provided Dockerfile:

```bash
git clone https://github.com/danielgonzagat/atomic-os
cd atomic-os
docker build -t atomic-os .
docker run --rm atomic-os node src/smoke.mjs
```

Expected output: `47 passed, 0 failed` and exit code 0.

To run the full paradigm-verify suite inside Docker:

```bash
docker run --rm \
  -v $(pwd)/formal:/app/formal \
  atomic-os node src/paradigm-verify.mjs
```

Expected output: the line `PARADIGM VERIFY: N/N green — P1–P10 DISCHARGED`
(where N = gates not skipped due to missing Python/Lean in the container).

For the complete evaluation with all 21 gates including Z3 and Lean, use a
host-side install (Python + Lean available):

```bash
# On the host, with Python 3 + Lean 4 installed:
npm run paradigm-verify
```

---

## 3. Reproducing the 21 Paradigm-Verify Gates

The single entry point is `npm run paradigm-verify` (alias: `node src/paradigm-verify.mjs`).

### Gate inventory

| Gate | Property | Script |
|---|---|---|
| build | Build compiles cleanly | `node src/build.mjs` |
| P1 | 47 production smoke checks | `node src/smoke.mjs` |
| P2 | Byte-floor refuses no valid edit (6 languages) | `node src/gates/byte-floor-language-soundness.proof.mjs --json` |
| P3 | Process/endpoint leaks caught | `node src/gates/resource-lifetime.proof.mjs --json && node src/gates/fd-socket-lifetime.proof.mjs --json` |
| P3b | Gate runs leave zero tree artifacts | `node src/gates/temp-artifact-hygiene.proof.mjs --json` |
| P3c | Every WRITE/DYNAMIC gate has paired adversarial proof | `node src/gates/per-gate-soundness-completeness.proof.mjs --json` |
| P4 | Closure meta-gate: every wired gate → named dimension | `node src/gates/closure-meta-gate.proof.mjs --json` |
| P-agent | Claude/Codex/OpenCode obey identical floor | `node src/gates/agent-independence.proof.mjs --json` |
| P5+P6 | Monotonic admission + coverage ratchet | `node src/gates/coverage-ratchet.proof.mjs --json` |
| lattice | Validator lattice internal consistency | `node src/gates/self-expansion-validator-lattice.proof.mjs --json` |
| sc-sync | Supply-chain resolver drift-guarded | `node src/gates/supply-chain-resolver-sync.proof.mjs --json` |
| P7-alg | Obligation-preserving confluence: runtime `commute()` == proven predicate | `node src/gates/algebra.proof.mjs && node src/gates/algebra-refinement.proof.mjs` |
| P7-z3 | Z3 theorem: all configurations, UNSAT-of-negation | `python3 formal/atomic-algebra/confluence_z3.py && python3 formal/atomic-algebra/nway_induction_z3.py` |
| P7-lean | Lean 4 induction: merge_preserves_read/verdict for all N | `lean formal/atomic-algebra/NwayConfluence.lean` |
| P8 | Disproof-as-recomputable-signal (teeth + consumer + briefing) | `node src/gates/negative-proof-teeth.proof.mjs && node src/gates/self-evolution-disproof-consumer.proof.mjs --json && node src/gates/self-evolution-disproof-briefing.proof.mjs --json` |
| E1 | Confluent friction-routed multi-agent editing | `node src/gates/e1-confluent-routing.proof.mjs` |
| E2 | Minimal recomputable disproof core | `node src/gates/e2-minimal-disproof.proof.mjs` |
| E3 | Org-scale self-improving guidebooks | `node src/gates/e3-guidebooks.proof.mjs` |
| E4 | Unified whole-system integration (E1×E2×E3) | `node src/gates/e4-unified.proof.mjs` |
| P9+P10 | Truth-funnel: verifier-gated answers + byte-positive monotone convergence | `node src/gates/truth-funnel.proof.mjs --json` |
| H-fixes | Session hardening regression (14 defect fixes) | `node src/gates/session-fixes-regression.proof.mjs` |

### Expected output
```
▶ build   build is green (the floor compiles) … GREEN
▶ P2      soundness: byte-floor refuses no valid edit … GREEN
▶ P3      completeness: process + endpoint leaks … GREEN
  …
──────────────────────────────────────────────
PARADIGM VERIFY: 21/21 green  —  P1–P10 DISCHARGED
──────────────────────────────────────────────
```

### Understanding SKIPs
Gates P7-z3 and P7-lean report `SKIP` when the required prover (Python 3 /
z3-solver / Lean 4) is absent. This is **honest**: the gate is not faked green.
The committed proof artifacts at `formal/atomic-algebra/confluence_z3.py`,
`nway_induction_z3.py`, and `NwayConfluence.lean` were machine-checked at
authoring time (exit 0 = all green); the SKIP here means the artifact exists
but the evaluator's machine lacks the prover to re-execute it.

To obtain a full `21/21 green` without SKIPs:

```bash
# Install Python dependencies
python3 -m venv .venv
.venv/bin/pip install z3-solver

# Install Lean 4
curl https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh -sSf | sh
# Restart shell or source ~/.elan/env

# Now run with the full toolchain visible
npm run paradigm-verify
```

---

## 4. Reproducing the Z3 Soundness Theorem

### File: `formal/atomic-algebra/confluence_z3.py`

This script discharges, via Z3, the implication for **all** configurations
(UNSAT-of-negation), not a bounded enumeration:

> `commute(P1,P2)` ∧ `P1` verified ∧ `P2` verified ⟹
> **L1** `verdict1(merge)` ∧ **L2** `verdict2(merge)` ∧
> **L3** `apply2(apply1(s)) = apply1(apply2(s))`

To reproduce:

```bash
cd formal/atomic-algebra
python3 -m venv .venv
.venv/bin/pip install z3-solver
.venv/bin/python3 confluence_z3.py
```

Expected output: every audit step prints `PASS … unsat`, final line `ALL GREEN`,
exit code 0.

The companion file `nway_induction_z3.py` machine-checks the REDUCE + STEP
lemmas that the Lean induction composes:

```bash
.venv/bin/python3 nway_induction_z3.py
```

Expected: `ALL GREEN`, exit code 0.

### Audit mechanism
Every guided Z3 hint in `confluence_z3.py` is **audited** before use:
`universals ⊨ hint` is checked UNSAT by an independent solver instance, so no
spurious assumption can manufacture a spurious result. This is documented in
the source (lines 31–33).

---

## 5. Reproducing the Lean 4 Induction Proof

### File: `formal/atomic-algebra/NwayConfluence.lean`

This file machine-checks, in Lean 4 (core, no mathlib), the **induction** that
Z3 cannot perform:

```lean
theorem merge_preserves_read (R : Loc → Bool) :
    ∀ (es : List (Edit Loc Byte)),
      (∀ e ∈ es, ∀ l, R l = true → e.mod l = false) →
      ∀ (s : Loc → Byte) (l : Loc), R l = true → merge es s l = s l

theorem merge_preserves_verdict (R : Loc → Bool) (verdict : (Loc → Byte) → Prop)
    (det : ∀ s s', (∀ l, R l = true → s l = s' l) → (verdict s ↔ verdict s'))
    (es : List (Edit Loc Byte))
    (h : ∀ e ∈ es, ∀ l, R l = true → e.mod l = false)
    (s : Loc → Byte) (hv : verdict s) :
    verdict (merge es s)
```

To reproduce:

```bash
cd formal/atomic-algebra
lean NwayConfluence.lean
```

Expected: exit code 0, no errors. The theorem is machine-checked by the Lean
kernel.

### What this proves
From the per-edit frame condition ("an edit changes nothing outside its mod-set")
plus the commute hypothesis ("every edit's mod-set is disjoint from the read-set
R"), the whole merged list preserves R's bytes — hence any verdict that depends
only on R is preserved — for **all N**, by induction on the edit list. Z3 proves
the base+step; Lean proves the induction lift.

---

## 6. Reproducing the 169,171 External Edit-Pair Soundness

```bash
# Clone the three independent OSS repositories
git clone https://github.com/colinhacks/zod /tmp/zod
git clone https://github.com/sindresorhus/type-fest /tmp/type-fest
git clone https://github.com/pmndrs/zustand /tmp/zustand

# Run the T3 corpus analysis
node formal/atomic-algebra/t3_corpus.mjs /tmp/zod /tmp/type-fest /tmp/zustand
```

Expected: each repository printed as one JSON line with `falseIndependence: 0`;
final line `TOTAL: 169171 real external pairs, false-independence (UNSOUND) = 0`;
exit code 0.

### What the oracle verifies
The script contains a **separately-written** transitive import-reachability
oracle (lines 15–50 of `t3_corpus.mjs`) that does **not** reuse the algebra's
`closureOf`. For every pair the algebra calls `commute=true`, the oracle checks
whether a real import path exists between the two files. A path found =
the algebra's independence call was unsound (false independence). The result:
**0 / 169,171**.

---

## 7. Reproducing the 47 Smoke Checks

```bash
npm run build
npm run smoke
# or equivalently:
npm test
```

The smoke suite exercises: build integrity, live MCP handshake, tool enumeration
(≥60 tools), firewall-guarded `atomic_replace_at`, path-escape refusal,
transactional sessions (begin → edit → rollback/commit), universal symbol editing
across Python/Go/Rust, universal navigation (`code_outline`, `code_read_symbol`),
universal import insertion (Ruby `require`, Go `import`), cross-file rename via
tree-sitter (zero LSP), decorator/await insertion, proof-chain CLI (`verify --head`,
`log`, `prove`, `verify-proof`), proof-carrying edit tamper detection, founder
report, coverage-gap detection, causal blame, incident → loop closure, MCP trust
firewall (scan/approve/verify with descriptor poisoning detection), and product-intent
gate.

Expected: `47 passed, 0 failed`, exit code 0.

---

## 8. Reproducing the 256 Unit Tests

```bash
npm run test:unit
```

This runs the Vitest suite: 256 tests covering the engine, gates, server helpers
(negative-proof, effect, IO, exec), trace integrity, and structural operations.

Expected: `256 passed`, exit code 0.

---

## 9. Reproducing the AtomicBench v1

```bash
node bench/mutation-bench.mjs
```

This measures the syntactic infallibility guarantee: identical edit proposals
(4 breaking mutation classes + 1 benign class per grammar) applied through the
atomic firewall vs. unconditional `writeFileSync`. Output: JSON with per-grammar
and aggregate statistics.

Expected: `atomicRefused` matches `controlPersistedInvalid` exactly (the firewall
catches every syntax-breaking edit before disk persistence), while `benign`
proposals are admitted at a non-zero rate (the firewall does not trivially refuse
everything).

---

## 10. Full Reproduction Checklist

For artifact evaluation badge applications (Available / Functional / Reusable):

- [ ] **Available:** Repository is public at `github.com/danielgonzagat/atomic-os` with MIT license.
- [ ] **Functional:**
  - [ ] `npm install && npm run build` succeeds
  - [ ] `npm test` exits 0 with `47 passed, 0 failed`
  - [ ] `npm run test:unit` exits 0 with all 256 tests passing
  - [ ] `npm run paradigm-verify` exits 0 (with honest SKIPs for absent provers)
  - [ ] `node formal/atomic-algebra/t3_corpus.mjs` exits 0 with false-independence = 0
- [ ] **Reusable:**
  - [ ] Dockerfile builds and runs smoke successfully
  - [ ] The MCP server connects to Claude Code / OpenCode / Codex
  - [ ] `atomic init` generates governance config in a fresh repo
  - [ ] All proof scripts accept `--json` for machine-readable output
