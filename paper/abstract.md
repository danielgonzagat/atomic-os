# Atomic OS: Provably-Confluent Multi-Agent Code Mutation with Byte-Positivity and Darwin-Gödel Self-Evolution

Daniel Penin Gonzaga

---

## Abstract

Large language models now routinely edit code, yet every mainstream agent writes
patches through an unverified text layer — a single misapplied rewrite can silently
corrupt correct bytes, break cross-file invariants, or introduce latent failures that
no downstream test catches. We present **Atomic OS**, a verified-code-mutation
operating system that replaces the unverified edit surface with a formal, machine-checked
substrate. Its core is the **byte-positivity law**: existing bytes are treated as
correct-by-construction, and any removal or overwrite is *refused* unless the agent
supplies a SHA-bound, machine-recomputed proof of incorrectness. This inverted
obligation pairs with a **commute-modulo-invariant edit algebra** whose independence
relation is judged over the same semantic read-set the verification gates read,
yielding a property no surveyed patch-theory or agent system states: a commuting
concurrent merge provably preserves both positive gate verdicts and negative disproof
obligations. The theory is machine-checked in **Z3** (UNSAT-of-negation over all
configurations) and **Lean 4** (induction for the N-way case), then demonstrated on
**169,171 real external edit-pairs** from three independent open-source repositories
with zero unsound false-independence verdicts. The system exposes **119 MCP tools**
spanning 11 tree-sitter grammars, universal cross-file rename, transactional sessions,
and a self-expansion loop (Darwin-Gödel) that feeds recomputed disproof witnesses
back to proposers. All **21 paradigm-verify gates** are dischargeable in one command,
and a **47-check production smoke suite** exercises the live firewall end-to-end.
The result is a measured, reproducible advance: for the first time, an autonomous
multi-agent editing system can be asked not *whether* it edited correctly, but
whether verifiable confluence and obligation-preservation hold — and answer with a
machine-checked proof.

**Keywords:** verified code mutation, multi-agent confluence, byte-positivity, formal methods, MCP
