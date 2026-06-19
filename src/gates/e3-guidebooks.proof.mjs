#!/usr/bin/env node
/**
 * e3-guidebooks.proof.mjs — PARADIGM PART D.3 / E3:
 * org-scale self-improving guidebooks with monotonic admission.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');
const E3 = await import(path.join(root, '..', 'atomic-edit-evolution', 'e3-guidebooks.mjs'));
const { createGuidebook, admitRule, inheritFrom, activeRules, hasConverged, growthRate } = E3;

let pass = 0, fail = 0;
const check = (n, c) => {
  const ok = Boolean(c); ok ? (pass += 1) : (fail += 1);
  console.log(`  ${ok ? 'PASS ' : 'FAIL '} ${n}`);
};

// E3-a: rules are admitted monotonically
{
  const gb = createGuidebook('test');
  const r1 = admitRule(gb, { id: 'r1', description: 'rule one', pattern: 'error', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  check('E3-a: first rule admitted', r1.admitted);
  check('E3-a: guidebook generation incremented', gb.generation === 1);
  check('E3-a: total admitted = 1', gb.totalAdmitted === 1);
}

// E3-b: identical rule is idempotent
{
  const gb = createGuidebook('test');
  admitRule(gb, { id: 'r1', description: 'rule', pattern: 'x', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  const r2 = admitRule(gb, { id: 'r1', description: 'rule', pattern: 'x', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  check('E3-b: identical rule refused (idempotent)', !r2.admitted);
}

// E3-c: different content for same id is refused
{
  const gb = createGuidebook('test');
  admitRule(gb, { id: 'r1', description: 'rule', pattern: 'x', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  const r2 = admitRule(gb, { id: 'r1', description: 'changed', pattern: 'y', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  check('E3-c: different content refused (must supersede)', !r2.admitted);
}

// E3-d: supersede replaces existing rule
{
  const gb = createGuidebook('test');
  admitRule(gb, { id: 'r1', description: 'v1', pattern: 'x', patternKind: 'regex', severity: 'warning', files: ['*.ts'] });
  const r2 = admitRule(gb, { id: 'r2', description: 'v2 stricter', pattern: 'y', patternKind: 'regex', severity: 'error', files: ['*.ts'], supersedes: 'r1' });
  check('E3-d: supersede admitted', r2.admitted);
  check('E3-d: superseded field set', r2.superseded === 'r1');
  check('E3-d: total admitted = 2', gb.totalAdmitted === 2);
}

// E3-e: active rules exclude superseded
{
  const gb = createGuidebook('test');
  admitRule(gb, { id: 'r1', description: 'v1', pattern: 'x', patternKind: 'regex', severity: 'warning', files: ['*.ts'] });
  admitRule(gb, { id: 'r2', description: 'v2', pattern: 'y', patternKind: 'regex', severity: 'error', files: ['*.ts'], supersedes: 'r1' });
  const active = activeRules(gb);
  check('E3-e: active rules exclude superseded (only r2 active)', active.length === 1 && active[0].id === 'r2');
}

// E3-f: inheritance merges parent rules
{
  const parent = createGuidebook('parent');
  admitRule(parent, { id: 'p1', description: 'parent rule', pattern: 'P', patternKind: 'regex', severity: 'warning', files: ['*.ts'] });

  const child = createGuidebook('child', ['parent']);
  admitRule(child, { id: 'c1', description: 'child rule', pattern: 'C', patternKind: 'regex', severity: 'error', files: ['*.ts'] });

  const merged = inheritFrom(child, [parent]);
  check('E3-f: child inherits parent rules', 'p1' in merged.rules);
  check('E3-f: child rules are present', 'c1' in merged.rules);
  check('E3-f: merged total = 2', merged.totalAdmitted === 2);
}

// E3-g: child overrides parent rule
{
  const parent = createGuidebook('parent');
  admitRule(parent, { id: 'shared', description: 'parent version', pattern: 'P', patternKind: 'regex', severity: 'warning', files: ['*.ts'] });

  const child = createGuidebook('child', ['parent']);
  admitRule(child, { id: 'shared', description: 'child override', pattern: 'C', patternKind: 'regex', severity: 'error', files: ['*.ts'] });

  const merged = inheritFrom(child, [parent]);
  check('E3-g: child overrides parent (child version wins)', merged.rules.shared.description === 'child override');
}

// E3-h: convergence detection
{
  const gb = createGuidebook('test');
  // Admit rules in early generations
  for (let i = 0; i < 5; i++) {
    admitRule(gb, { id: 'r' + i, description: 'rule ' + i, pattern: String(i), patternKind: 'regex', severity: 'warning', files: ['*.ts'] });
  }
  // Manually advance generation to simulate 15 idle generations after admissions
  for (let i = 0; i < 15; i++) {
    gb.generation += 1;
    gb.sha256 = ''; // invalidate hash (not relevant for convergence check)
  }
  // Now generation = 20, last admission was at gen 5; window 10 → converged
  const conv = hasConverged(gb, 10);
  check('E3-h: converged when no new rules in last 10 generations', conv);

  admitRule(gb, { id: 'r99', description: 'recent', pattern: '99', patternKind: 'regex', severity: 'error', files: ['*.ts'] });
  const notConv = hasConverged(gb, 10);
  check('E3-h: not converged after recent admission', !notConv);
}

// E3-i: growth rate
{
  const gb = createGuidebook('test');
  for (let i = 0; i < 10; i++) {
    admitRule(gb, { id: 'r' + i, description: 'r', pattern: String(i), patternKind: 'regex', severity: 'warning', files: ['*.ts'] });
  }
  check('E3-i: growth rate = 1.0 for 10 rules in 10 generations', Math.abs(growthRate(gb) - 1.0) < 0.01);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
