# Benchmark Dataset: Provably-Confluent Multi-Agent Code Mutation

## 1. The 4-Arm Protocol

The benchmark isolates the *mechanism* from the model by holding the proposer
constant (frozen LLM) across four arms that differ **only** in the edit substrate.
Every arm receives identical task prompts and produces edit proposals; the dependent
variable is **correct-throughput** — the number of tasks whose final persisted state
passes the same syntactic-structural validator (the Atomic OS engine's `validate`
function, deployed identically across arms).

### Arm 1: atomic-core (baseline)
- Single-agent, **no friction routing**, **no edit algebra**.
- The agent edits sequentially; each edit goes through the byte-positivity firewall
  individually but without commute guarantees.
- Confluence = serialized ordering (no concurrent wavefront).
- Measures: correct-throughput, wall-clock time, byte-churn.

### Arm 2: atomic+routing (E1 fusion)
- **Multi-agent** with friction routing (`friction-router.mjs`, `e1-fusion.mjs`).
- The friction ledger routes tasks to agents so concurrent wavefronts operate on
  **disjoint loci**.
- The (e) edit algebra **machine-checks** that the routed wavefront's concurrent
  merge is confluent AND preserves every edit's disproof obligation.
- Agents = K ≥ 2 identical frozen LLM instances.
- Measures: correct-throughput, confluent-throughput width, obligation-preservation
  rate, wall-clock time.

### Arm 3: Nidus-style (stigmergic, no algebra)
- Multi-agent with a Git-as-WAL coordination substrate (analogous to Nidus,
  arXiv 2604.05080).
- Agents push to branches; merge is git-ordered (sequential), not algebra-proven.
- Simulates the "routing without confluence proof" regime.
- Measures: correct-throughput, merge-conflict rate, wall-clock time.

### Arm 4: baseline (no firewall)
- Multi-agent with **no byte-positivity firewall**, **no routing**, **no algebra**.
- Agents use a standard text-editor surface (writeFile/apply_patch) without
  validation gates.
- Measures: correct-throughput, broken-state count, wall-clock time.

### Pre-registered hypothesis
**H₁:** arm-2 strictly dominates arms 1, 3, and 4 on correct-throughput.
**Death condition:** no metric separates the arms ⇒ recorded as "no emergence
in this arena" without spin.

---

## 2. Reproducibility Instructions

### Prerequisites
- Node.js ≥ 20, Python ≥ 3.10 with `z3-solver`, Lean 4 (via `elan`), and git.
- Clone the repository:
  ```bash
  git clone https://github.com/danielgonzagat/atomic-os
  cd atomic-os
  npm install
  npm run build
  ```

### Verify the internal properties (one command)
```bash
npm run paradigm-verify
```
This executes all 21 gates: P1 (47 smoke checks), P2–P6 (soundness/completeness/
closure/monotonic-admission), P7 (Z3 + Lean algebra theorems), P8 (disproof-as-
signal), E1–E4 (emergent fusions), P9+P10 (truth funnel), and the hardening
regression suite. Exit code 0 = all green.

### Run the 4-arm benchmark (Docker, one command)
```bash
docker build -t atomic-os .
docker run --rm -v $(pwd)/results:/app/results atomic-os \
  node evolution/experiment-harness.mjs \
    --arms 4 --trials 10 --agents 4 --tasks 40 \
    --proposer-frozen --output /app/results/bench.json
```
The harness enforces: frozen proposer (byte-identical skeleton across arms),
anti-leakage (EScalar+briefing rejected even with valid hash), shadow budget B=3,
hash-chained run ledger, and aggregate mean±sd (never best-run).

### Reproduce the 169,171 external edit-pair analysis
```bash
# Clone the three external OSS repos
git clone https://github.com/colinhacks/zod /tmp/zod
git clone https://github.com/sindresorhus/type-fest /tmp/type-fest
git clone https://github.com/pmndrs/zustand /tmp/zustand

# Run the T3 corpus analysis
node formal/atomic-algebra/t3_corpus.mjs /tmp/zod /tmp/type-fest /tmp/zustand
```
Expected output: `TOTAL: 169171 real external pairs, false-independence (UNSOUND) = 0`.
Exit code 0 confirms zero unsound false-independence verdicts.

---

## 3. Dataset Schema for the 169k External Edit Pairs

Each edit-pair in the T3 corpus is an `(EditFact, EditFact)` tuple processed by
the `commute()` predicate from `gates/algebra.ts`. The dataset is generated
on-the-fly from the three repositories; no pre-computed artifact ships.

### EditFact Schema
```typescript
interface EditFact {
  repoRoot: string;          // absolute path to the repository clone
  file: string;               // repository-relative path, e.g. "src/types.ts"
  modifiedZones: Zone[];      // byte-span regions this edit touches
  closure: string[];           // files transitively reachable via imports
  readLoci: LocusSet;          // loci the gate read to discharge obligations
  negativeProof?: {            // present when the edit is a negative-byte action
    proofSha256: string;       // SHA-256 of the recomputed disproof witness
    kind: "duplicate" | "gate-red";
    witness: string;           // machine-recomputed counterexample
  };
}

interface Zone {
  byteStart: number;           // 0-indexed byte offset
  byteEnd: number;             // exclusive
}

interface LocusSet {
  files: Set<string>;          // files read by the gate
  spans: Map<string, Zone[]>;  // byte spans read within each file
}
```

### Commute Verdict Schema
```typescript
interface CommuteVerdict {
  commute: boolean;             // true iff mod1∩mod2=∅ ∧ mod2∩read1=∅ ∧ mod1∩read2=∅
  reason?: string;              // human-readable explanation when !commute
  preservedDisproofs?: string[]; // SHA-256 hashes of preserved disproof obligations
}
```

### Oracle Cross-Check
Every `commute=true` verdict is independently verified by a **separately-written**
transitive import-reachability oracle (`t3_corpus.mjs` lines 15–50) that walks
`import`/`require`/`from` statements without reusing the algebra's `closureOf`,
so agreement is a genuine cross-check, not a tautology.

### T3 Result Schema
```typescript
interface T3Result {
  summary: RepositoryResult[];
  totalPairs: number;    // 169,171
  totalFalse: number;    // expected: 0
}

interface RepositoryResult {
  repo: string;          // "zod" | "type-fest" | "zustand"
  files: number;         // number of .ts/.tsx files scanned
  pairs: number;         // edit-pair count (n-choose-2)
  commuteRate: number;   // percentage of pairs the algebra called independent
  falseIndependence: number;  // expected: 0 — oracle found a missed import path
  byteConfluentIndependentPairs: number; // different-file independent pairs (byte-disjoint)
}
```

The zodiac-specific breakdown:
| Repository | Files | Edit-pairs | False-independence |
|---|---|---|---|
| zod | 401 | 80,200 | 0 |
| type-fest | 421 | 88,410 | 0 |
| zustand | 34 | 561 | 0 |
| **Total** | **856** | **169,171** | **0** |

---

## 4. Honest Limitations (Pre-Declared)

- **Decidable fragment only.** The edit algebra applies to the decidable gate
  fragment. `UNJUDGED` remains a first-class verdict; Rice's theorem is side-stepped,
  not defeated.
- **Same-file positional coupling** (non-identifier intra-file dependencies, e.g.,
  two edits to adjacent lines in the same function whose correctness depends on
  execution order) is the named undecidable residual — analogous to the cross-file
  dynamic-import residual.
- **External benchmark is pre-registered but not yet executed.** The 4-arm protocol
  is specified, harnessed, and death-conditioned; the LLM-driven run requires
  API access and is documented as future work (`F.4 layer-2`).
- **Agent-independence is proven for Claude/Codex/OpenCode** on the identical
  byte-floor; other agents (Cursor, Copilot, Aider) have not been tested.
