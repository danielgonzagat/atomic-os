---
name: feedback-atomic-action-principle
description: The founding principle of the Atomic Operating System — every atomic-OS/MCP tool update must move the system measurably closer to it
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 13251f38-1665-4e59-9bd5-d6cf5bfde866
---

**Princípio da Ação Atômica Verificável Orientada a Produto** (+ corollary
**Princípio da Preservação Máxima com Mutação Mínima**). Ratified by Daniel
2026-05-16 as the permanent north star for the atomic-edit OS and the A/B
self-improvement loop. Related: [[feedback_tui_abolished_tool_only]],
[[reference_atomic_edit_mcp]], [[project_atomic_ab_loop]].

**Core:** an AI must change the smallest piece needed to realize a *real
product intention*, prove exactly what changed, preserve everything that did
not need to change, validate the final behavior, persist continuity, and let a
non-technical person trust the result *without reading code*. Autonomy is
bounded not by model IQ but by the **granularity, verifiability and
reliability of the action space**. Intention high → action minimal → proof
clear → rollback possible → continuity persisted → product working as the end.

**Hierarchy of intent (pick the highest operator that expresses the intention,
execute at the lowest granularity that is faithful & damage-free):** product/
behavior → change intention → multi-file transaction → catalogued refactor →
semantic operation → symbol → structural node → range → char → byte. Never
"old line died, new line born" when a sub-structure anchor is preservable.

**Preservation topology — classify BEFORE editing:** (1) preserved anchors,
(2) modified zones, (3) movement zones, (4) wrapper/context, (5) behavior
changed?, (6) public contract changed?, (7) which validation is required
(syntax|type|test|real behavior). 25 canonical topologies exist (value vs
field vs wrapper vs operator vs callee vs args vs list-item vs order vs
position/move vs signature vs body vs api-vs-impl vs type vs decorator vs
scope vs representation vs behavior-vs-structure vs proof-only vs
contract-only). Each should map to an explicit, well-named operator that emits
a preservation map (preservedZones / modifiedZones / movementZones /
semanticImpact / inlinePreview `[-old-]{+new+}` / validation), not just
oldText/newText. Anti-pattern `line_rewrite_regression`: whole-line +/- is
allowed ONLY when the whole line truly was created/removed or no preservable
anchor exists.

**Why:** for a non-technical owner the failure mode isn't only "AI edits
wrong" — it's "owner can't tell if it edited right". Coarse text generation
forces the human to act as a mental compiler. The principle converts the CLI
from "programmer that spits patches" into a "verifiable operator of product
intentions", which is *access*, not just productivity.

**How to apply (loop directive):** every time the loop updates the atomic
operating system (the MCP server + tools shared across Codex/Claude/OpenCode,
their hooks and integrations), the change MUST close the gap to this principle
— add/refine operators so more of the 25 topologies are first-class, emit
richer preservation/behavior proofs, strengthen pre-write validation, trace,
continuity and non-technical behavioral trust. Goal of the loop: the atomic OS
becomes *measurably, provably much superior* to the normal/factory CLI agent
across every benchmark that matters, by a wide sustained margin. Keep the
product-first cut rule (don't build an infinite cathedral; superiority must
show in real measured task outcomes, not tooling for its own sake).

---
**EXPANSION (Daniel, 2026-05-16, ratified): Princípio da Preservação Máxima
com Mutação Mínima + 25-topology matrix.** Every atomic-OS update must move
toward a topology-aware operator set, not just payload tweaks. Before editing,
the OS/agent classifies: preserved anchors / modified zones / movement zones /
wrapper-context / behavior-changed? / public-contract-changed? / which
validation (syntax|type|test|behavior). 25 canonical topologies (value-vs-
field, callee-vs-args, list add/remove, reorder=movement, identity-pos move,
sig-vs-body, api-vs-impl, type-vs-value, decorator, scope, representation,
behavior-vs-structure, proof-only, contract-only). Each → an explicit named
operator (rename_property_keep_value, replace_callee_keep_args,
move_symbol_keep_body, change_signature_keep_body, add_decorator_keep_method,
move_into_transaction, preserve_api_replace_impl, …) emitting a
preservation-map trace (preservedZones/modifiedZones/movementZones/
semanticImpact/inlinePreview). Anti-pattern `line_rewrite_regression`:
whole-line +/- only when the whole line truly was created/removed or no
preservable anchor exists. The loop's atomic-OS upgrades must (a) cut per-op
overhead (proven token sink), (b) make atomic_transaction robust for one-
intention multi-file batches, (c) progressively add the highest-leverage
topology operators (esp. move_symbol_to_file / extract — directly collapses
decomposition op-count, the measured bottleneck). Goal unchanged: atomic
beats normal on EVERY benchmark by a huge sustained margin, then escalate
complexity; loop never ends.
