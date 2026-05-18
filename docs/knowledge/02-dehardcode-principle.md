---
name: feedback-atomic-dehardcode-principle
description: Princípio da Des-hardcodificação Operacional — Atomic OS = fixed constitutional kernel + 100% dynamic operational policy; governs every loop lever
metadata:
  node_type: memory
  type: feedback
  originSessionId: 13251f38-1665-4e59-9bd5-d6cf5bfde866
---

Daniel, 2026-05-17 (ratified mid-loop; sharpens [[feedback_atomic_absorb_brute_advantages]]
+ [[feedback_atomic_action_principle]]; governs lever selection in
[[project_atomic_ab_loop]]).

**Princípio da Des-hardcodificação Operacional:** every Atomic-OS behavior
that is NOT a security invariant must be discovered / inferred / compiled /
chosen DYNAMICALLY from intention, repo, task, worktree, tests and current
state. The OS carries **fixed laws, not fixed solutions**. NOT "zero hardcode"
(that kills the OS) — it is **zero *operational* hardcode, mandatory *invariant*
hardcode**.

**FIXED kernel (never dynamic — the immune system):** no edit outside allowed
root/worktree; no protected-file touch; no bypass; no faked/unvalidated
success; no stub-as-real; no edit without trace; no disguised shell write; no
ignoring failing tests; no secret/env tampering; rollback unbreakable;
non-façade. Dynamizing these = "Normal in a costume / pretty chaos."

**DYNAMIC policy (must stop being hardcoded):** which operator, which prompt,
which allowed scope/paths, which validation suite, which fast-path, which
report, which preservation topology, task class, latency/tool-call/token
budget, trace verbosity. The worker prompt must carry the *fast-path*, not the
doctrine (doctrine lives in the system); minimal prompt, minimal reasoning,
minimal time-to-first-write.

**Why (measured, not philosophy):** A/B rounds show Atomic loses only when it
carries needless operational rigidity — abs/rel allowedPaths breaking a tx,
weak local/nested symbol discovery, preview+apply duplication, prompt hauling
"the Atomic bible", MCP relative paths hitting the wrong root, micro-ops where
a macro operator belongs, time-to-first-write (R66: Normal 2m34s vs Atomic
6m18s to first write even though Atomic won overall). When calibrated, Atomic
already wins hard (R12: −23% time, −27% events; R35: far less operational
surface; R66: macro-refactor overall win). The fix for each loss = convert one
rigidity into governed inference, re-measure.

**"Normal as teacher" loop:** every time Normal wins, ask which *brute*
advantage it used (broad command, less reading, less validation, direct patch,
less prompt, better heuristic, earlier first write) → convert it into a SAFE
atomic macro version (eslint --fix → analyzer dry-run tx; direct patch → batch
atomic tx; manual refactor → split_service_transaction; free reading →
AST/public-surface plan; long prompt → fast-path compiler; fixed rule →
dynamic policy; micro-edits → one macro-atomic intention). Velocidade do
Normal + segurança/trace/preservação/continuidade do Atomic = modo superior,
não modo seguro.

**Target MCP family the loop builds toward:** atomic_task_classifier,
atomic_policy_compiler (intent+worktree+scope+risk+files+gates+task-class+repo
→ minimal prompt + main operator + fallbacks + allowedPaths + validations +
report + time/tool/token budget), atomic_operator_selector,
atomic_validation_planner (impact-scaled, not a fixed ladder),
atomic_fastpath_builder, atomic_allowed_scope_resolver (derive from worktree
root + task target + git diff + package boundary + protected + benchmark lane),
atomic_topology_classifier (classify preservation from before/after),
atomic_prompt_minifier, atomic_inventory_hardcode, atomic_benchmark_feedback_loop.
Plus macro operators per task-class: lint-tx, service-split, API-wiring,
DB-migration, fe↔be wiring, webhook-consumption, test-repair.

**"Win everything" maturity criterion (per task-class, ≥2-3 rounds, low-noise):**
same gates pass; no protected touch; behavior not reduced; ≤ Normal agent
time; ≤ tokens; ≤ commands; ≤ diff surface; ≥ preserved intention; ≥ proof;
≤ human intervention. Lose any important metric → do NOT escalate complexity;
open an Atomic-OS defect; convert rigidity→inference / micro→macro operator;
re-measure. Honest scope: trivial/zero-risk/raw-speed-only benchmarks may
favor Normal by design — the goal is to win **everything that matters for
real complex software construction**, and there Atomic only wins efficiency
when its fast-path is as short as Normal's. Loop infinite per Daniel.

**ANTI-OVERFIT / DYNAMIC-TARGET DISCIPLINE (Daniel, 2026-05-17):** the planner
LOC constants hand-tuned across tooldev15–17 (≤330/345 band, floor
max(180,35%)) are THEMSELVES operational hardcode against ONE benchmark file
(unified-agent.service.ts) — overfit risk. Mature direction: derive the
target band + floor DYNAMICALLY from the task oracle / contract (the
benchmark's stated ≤350-LOC goal, original file size, module cap), not baked
magic numbers in server.ts. When escalation comes, vary the real in-repo task
(different service/file/shape) so OS gains generalize, and treat each
complexity tier as a holdout: an upgrade only counts if it wins on a task it
was NOT tuned against. Per-tier probabilistic expectation (set
expectations, don't over-claim): trivial 1-line/zero-risk tasks → Atomic may
tie or lose (OS overhead not worth it, by design); medium real tasks → Atomic
wins once fast-path mature; complex multi-file/regression-risk product/refactor
→ Atomic wins big (Normal pays invisible costs: drift, churn, broken
contract/public-API, no trace/rollback/proof — e.g. R078: Normal passed Jest
but FAILED public-API audit; Atomic passed both). Public benchmarks: avoid
overfit, prove on holdout. Victory is the SYMPTOM of correct expanded
atomicity, never the target.
Roadmap framing: Atomic v1 atomic edit → v2 topological preservation → v3
transaction-by-intention → **v4 dynamic system, zero operational hardcode**.
