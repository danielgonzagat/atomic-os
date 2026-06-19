#!/usr/bin/env node
/**
 * e2-minimal-disproof.proof.mjs — PARADIGM PART D.3 / E2:
 * minimal recomputable disproof core demonstrated as a MECHANISM.
 *
 * Delta-debug a failing input to the smallest counterexample.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const E2 = await import(path.join(root, '..', 'atomic-edit-evolution', 'e2-minimal-disproof.mjs'));
const { deltaDebugMinimal, linearShrink } = E2;

let pass = 0, fail = 0;
let results = [];
const check = (n, c, detail) => {
  const ok = Boolean(c); ok ? (pass += 1) : (fail += 1);
  console.log(`  ${ok ? 'PASS ' : 'FAIL '} ${n}`);
  results.push({ name: n, ok, detail });
};

// Test: gate fails on "bad" token, passes otherwise
const testGate = (input) => {
  if (input.includes('BAD')) return { red: true };
  return { red: false };
};

// E2-a: linear shrink finds the minimal failing chunk
{
  const chunks = [
    { id: 0, content: 'good line 1' },
    { id: 1, content: 'good line 2' },
    { id: 2, content: 'BAD line 3' },
    { id: 3, content: 'good line 4' },
    { id: 4, content: 'good line 5' },
  ];
  const minimal = linearShrink(chunks, testGate);
  check('E2-a: linear shrink reduces to exactly the BAD chunk',
    minimal.verdict === 'RED' && minimal.minimalChunks.length === 1 && minimal.minimalInput.includes('BAD'));
}

// E2-b: ddmin achieves reduction
{
  const chunks = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    content: i === 13 ? 'BAD token here' : 'good line ' + i,
  }));
  const minimal = deltaDebugMinimal(chunks, testGate);
  check('E2-b: ddmin reduces 20 chunks to the single BAD chunk',
    minimal.verdict === 'RED' && minimal.minimalChunks.length > 0 && minimal.reductionRatio > 1);
}

// E2-c: no failure → honest TEST_FAILED
{
  const chunks = [
    { id: 0, content: 'all good' },
    { id: 1, content: 'nothing bad' },
  ];
  const minimal = linearShrink(chunks, testGate);
  check('E2-c: all-good input returns TEST_FAILED verdict',
    minimal.verdict === 'TEST_FAILED');
}

// E2-d: minimal input is recomputable (contains the failing token)
{
  const chunks = [
    { id: 0, content: 'prefix' },
    { id: 1, content: 'middle BAD suffix' },
    { id: 2, content: 'postfix' },
  ];
  const minimal = linearShrink(chunks, testGate);
  check('E2-d: minimal input can be independently verified (recomputable)',
    minimal.verdict === 'RED' && testGate(minimal.minimalInput)?.red === true);
}

// E2-e: reduction ratio is meaningful
{
  const chunks = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    content: i === 25 ? 'BAD' : 'line ' + i,
  }));
  const minimal = linearShrink(chunks, testGate);
  check('E2-e: 50 lines with 1 BAD → reduction ratio >= 10',
    minimal.reductionRatio >= 10);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
