#!/usr/bin/env node
/**
 * e4-unified.proof.mjs — PARADIGM PART D.3 / E4:
 * the unified whole-system integration: E1 × E2 × E3 in one closed loop.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const E4 = await import(path.join(root, '..', 'atomic-edit-evolution', 'e4-unified.mjs'));
const { createUnifiedSystem, runIteration, convergenceMetrics } = E4;

let pass = 0, fail = 0;
const check = (n, c) => {
  const ok = Boolean(c); ok ? (pass += 1) : (fail += 1);
  console.log(`  ${ok ? 'PASS ' : 'FAIL '} ${n}`);
};

// E4-a: system initializes clean
{
  const sys = createUnifiedSystem('e4-test');
  check('E4-a: system created with generation 0', sys.generation === 0);
  check('E4-a: no wall hits initially', sys.totalWallHits === 0);
  check('E4-a: empty history', sys.history.length === 0);
}

// E4-b: one full iteration completes
{
  const sys = createUnifiedSystem('e4-test');

  const testGate = (input) => ({ red: input.includes('BAD') });
  const iter = runIteration(
    sys,
    [{ taskId: 't1', invariants: ['fileA.ts'] }],
    ['claude', 'codex'],
    [{ agent: 'claude', invariantId: 'fileA.ts' }],
    [{ invariantId: 'fileA.ts', input: 'line1\nBAD line2\nline3\nline4', test: testGate }],
  );

  check('E4-b: iteration incremented generation', sys.generation === 1);
  check('E4-b: routing assigned agents', iter.routing.length === 1);
  check('E4-b: wall hits recorded', iter.wallHits.length === 1);
  check('E4-b: disproofs generated (minimal)', iter.disproofs.length > 0);
  check('E4-b: lessons admitted to guidebook', iter.admissions.length > 0);
}

// E4-c: wall hits decrease over time (convergence)
{
  const sys = createUnifiedSystem('e4-test');
  const testGate = (input) => ({ red: input.includes('BAD') });

  // Simulate improving agent: fewer wall hits over time, eventually zero
  // Run 22 iterations: first ~10 have wall hits, last ~12 have none
  for (let gen = 0; gen < 22; gen++) {
    const wallCount = gen < 10 ? Math.max(0, 5 - Math.floor(gen / 2)) : 0;
    const walls = Array.from({ length: wallCount }, (_, i) => ({
      agent: 'claude',
      invariantId: 'inv-' + (i % 3),
    }));

    const cx = wallCount > 0
      ? [{ invariantId: 'inv-0', input: 'x\nBAD\ny\nz\nw', test: testGate }]
      : [];

    runIteration(
      sys,
      [{ taskId: 't' + gen, invariants: ['inv-0'] }],
      ['claude', 'codex'],
      walls,
      cx,
    );
  }

  const metrics = convergenceMetrics(sys);
  check('E4-c: wall-hit trend is decreasing or stable-at-zero', metrics.wallHitTrend === 'decreasing' || metrics.wallHitTrend === 'stable');
  check('E4-c: convergence detected (no wall hits in late generations, guidebook converged)', metrics.converged);
}

// E4-d: guidebook accumulates rules
{
  const sys = createUnifiedSystem('e4-test');
  const testGate = (input) => ({ red: input.includes('ERR') });

  for (let gen = 0; gen < 5; gen++) {
    runIteration(
      sys,
      [{ taskId: 't' + gen, invariants: ['inv-' + gen] }],
      ['claude'],
      [{ agent: 'claude', invariantId: 'inv-' + gen }],
      [{ invariantId: 'inv-' + gen, input: 'good\nERR-' + gen + '\nmore', test: testGate }],
    );
  }

  check('E4-d: guidebook accumulated rules', sys.guidebook.totalAdmitted >= 5);
  check('E4-d: total admissions tracked', sys.totalAdmissions >= 5);
}

// E4-e: pheromone state feeds back into routing
{
  const sys = createUnifiedSystem('e4-test');
  const testGate = (input) => ({ red: input.includes('BAD') });

  // First iteration: agent hits wall on fileA
  runIteration(
    sys,
    [{ taskId: 't1', invariants: ['fileA.ts'] }],
    ['claude', 'codex'],
    [
      { agent: 'claude', invariantId: 'fileA.ts' },
      { agent: 'claude', invariantId: 'fileA.ts' },
      { agent: 'claude', invariantId: 'fileA.ts' },
    ],
    [{ invariantId: 'fileA.ts', input: 'a\nBAD\nb', test: testGate }],
  );

  // Second routing: claude has high friction for fileA, codex should get it
  const { routeTask } = await import(path.join(root, '..', 'atomic-edit-evolution', 'friction-router.mjs'));
  const result = routeTask(
    { invariants: ['fileA.ts'] },
    ['claude', 'codex'],
    sys.pheromoneState,
  );

  check('E4-e: routing prefers agent with lower friction (codex over claude for fileA)',
    result.agent === 'codex' || result.frictionScores[0].score < result.frictionScores[1].score);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
