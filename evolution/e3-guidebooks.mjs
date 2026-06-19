/**
 * e3-guidebooks.mjs — PARADIGM PART D.3 / E3: org-scale self-improving guidebooks.
 *
 * A guidebook is a monotonic rulebook that encodes "known correct patterns" for
 * a codebase. Guidebooks INHERIT from parent guidebooks (org → team → project)
 * and only GROW over time (monotonic admission: coverage never decreases).
 *
 * The ratchet: once a rule is admitted, it stays admitted forever. Rules can be
 * SUPERSEDED (replaced by a stricter version) but never removed. This creates
 * a convergence guarantee: as more edits are performed, the guidebook accumulates
 * more rules, and the rate of gate failures decreases → Darwin-Gödel convergence.
 *
 * Pure functions — no side effects.
 */

import * as crypto from 'node:crypto';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalRule(rule) {
  return JSON.stringify({
    id: rule.id,
    pattern: rule.pattern,
    patternKind: rule.patternKind,
    severity: rule.severity,
    files: [...rule.files].sort(),
    supersedes: rule.supersedes ?? null,
  });
}

/**
 * Create an empty guidebook.
 * @param {string} name
 * @param {string[]} inherits
 */
export function createGuidebook(name, inherits) {
  const gb = {
    name,
    inherits: inherits ?? [],
    rules: {},
    totalAdmitted: 0,
    generation: 0,
    sha256: '',
  };
  gb.sha256 = sha256(JSON.stringify({ name, inherits: gb.inherits, rules: {} }));
  return gb;
}

/**
 * Admit a rule into a guidebook. Monotonic: once admitted, never removed.
 * A rule can SUPERSEDE an existing rule (replace with stricter version).
 *
 * @param {object} guidebook
 * @param {object} rule — { id, description, pattern, patternKind, severity, files, supersedes? }
 * @returns {{ admitted: boolean, rule?: object, superseded?: string, reason: string }}
 */
export function admitRule(guidebook, rule) {
  const content = canonicalRule(rule);
  const contentSha = sha256(content);
  const fullRule = {
    id: rule.id,
    description: rule.description,
    admittedAt: guidebook.generation + 1,
    contentSha256: contentSha,
    pattern: rule.pattern,
    patternKind: rule.patternKind,
    severity: rule.severity,
    files: rule.files,
    supersedes: rule.supersedes,
  };

  // Check if rule already exists
  const existing = guidebook.rules[rule.id];
  if (existing) {
    if (existing.contentSha256 === contentSha) {
      return { admitted: false, reason: `rule ${rule.id} already admitted (identical content)` };
    }
    return {
      admitted: false,
      reason: `rule ${rule.id} already exists with different content; use supersede to replace it`,
    };
  }

  // Handle supersede
  if (rule.supersedes) {
    const target = guidebook.rules[rule.supersedes];
    if (!target) {
      return { admitted: false, reason: `supersede target ${rule.supersedes} not found` };
    }
  }

  // Admit the rule
  guidebook.rules[rule.id] = fullRule;
  guidebook.totalAdmitted += 1;
  guidebook.generation += 1;
  guidebook.sha256 = sha256(JSON.stringify(guidebook));

  return {
    admitted: true,
    rule: fullRule,
    superseded: rule.supersedes,
    reason: `rule ${rule.id} admitted at generation ${fullRule.admittedAt}`,
  };
}

/**
 * Merge a child guidebook with its parent(s).
 * The child inherits ALL rules from parents that it doesn't override.
 *
 * @param {object} child
 * @param {object[]} parents
 * @returns {object}
 */
export function inheritFrom(child, parents) {
  const merged = {};

  // First, inherit all parent rules
  for (const parent of parents) {
    for (const [id, rule] of Object.entries(parent.rules)) {
      const childHasRule = id in child.rules;
      const childSupersedes = Object.values(child.rules).some((r) => r.supersedes === id);
      if (!childHasRule && !childSupersedes) {
        merged[id] = rule;
      }
    }
  }

  // Child rules override
  for (const [id, rule] of Object.entries(child.rules)) {
    merged[id] = rule;
  }

  const totalAdmitted = Object.keys(merged).length;
  return {
    name: child.name,
    inherits: child.inherits,
    rules: merged,
    totalAdmitted,
    generation: child.generation,
    sha256: sha256(JSON.stringify({ name: child.name, inherits: child.inherits, rules: merged })),
  };
}

/**
 * Find all active (non-superseded) rules in a guidebook.
 * @param {object} guidebook
 * @returns {object[]}
 */
export function activeRules(guidebook) {
  const superseded = new Set();
  for (const rule of Object.values(guidebook.rules)) {
    if (rule.supersedes) superseded.add(rule.supersedes);
  }
  return Object.values(guidebook.rules).filter((r) => !superseded.has(r.id));
}

/**
 * Check if a guidebook has converged (no new rules in the last N generations).
 * @param {object} guidebook
 * @param {number} [windowGenerations]
 * @returns {boolean}
 */
export function hasConverged(guidebook, windowGenerations) {
  const w = windowGenerations ?? 10;
  const recentAdmissions = Object.values(guidebook.rules).filter(
    (r) => guidebook.generation - r.admittedAt < w,
  );
  return recentAdmissions.length === 0;
}

/**
 * Compute the coverage growth rate (rules admitted per generation).
 * @param {object} guidebook
 * @returns {number}
 */
export function growthRate(guidebook) {
  if (guidebook.generation === 0) return 0;
  return guidebook.totalAdmitted / guidebook.generation;
}
