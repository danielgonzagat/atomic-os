/**
 * e4-unified.mjs — PARADIGM PART D.3 / E4: unified whole-system integration.
 *
 * The "all 8 adjectives" system: wires E1 (confluent routing), E2 (minimal disproof),
 * and E3 (guidebooks) into one functional loop.
 *
 * Four-phase pipeline:
 *   PHASE I   — Friction-route tasks to agents (E1)
 *   PHASE II  — Execute edits; captures wall-hit events
 *   PHASE III — Delta-debug failures to minimal disproofs (E2)
 *   PHASE IV  — Admit lessons into guidebooks; feeds back into Phase I routing (E3)
 *
 * This creates a CLOSED GRADIENT LOOP:
 *   edits → wall hits → pheromone → routing → better edits → fewer wall hits
 *
 * The loop itself is the Darwin-Gödel self-improvement mechanism.
 */

import {
  buildFrictionLedger,
  routeTask,
} from './friction-router.mjs';
import { linearShrink } from './e2-minimal-disproof.mjs';
import {
  createGuidebook,
  admitRule,
} from './e3-guidebooks.mjs';

/**
 * Create a fresh unified system.
 * @param {string} guidebookName
 */
export function createUnifiedSystem(guidebookName) {
  return {
    generation: 0,
    pheromoneState: buildFrictionLedger([]),
    guidebook: createGuidebook(guidebookName),
    history: [],
    totalWallHits: 0,
    totalDisproofs: 0,
    totalAdmissions: 0,
  };
}

/**
 * PHASE I: Route a batch of tasks to agents using the current friction ledger.
 *
 * @param {object} state
 * @param {Array<{taskId: string, invariants: string[]}>} tasks
 * @param {string[]} agents
 * @returns {Array<{agent: string, taskId: string}>}
 */
export function phaseRoute(state, tasks, agents) {
  return tasks.map((task) => {
    const result = routeTask(task, agents, state.pheromoneState);
    return { agent: result.agent, taskId: task.taskId };
  });
}

/**
 * PHASE II: Record wall-hit events from edit execution.
 * These feed into the pheromone field for the next routing cycle.
 *
 * @param {object} state
 * @param {Array<{agent: string, invariantId: string}>} events
 */
export function phaseRecordWallHits(state, events) {
  state.totalWallHits += events.length;

  const existingEvents = [];
  for (const iter of state.history) {
    existingEvents.push(...iter.wallHits);
  }
  existingEvents.push(...events);

  state.pheromoneState = buildFrictionLedger(existingEvents, {
    window: state.pheromoneState.window,
  });
}

/**
 * PHASE III: Generate minimal disproofs from wall-hit counterexamples.
 *
 * @param {object} state
 * @param {Array<{invariantId: string, input: string, test: Function}>} counterexamples
 * @param {object} [opts]
 * @returns {Array<{invariantId: string, minimalInput: string, reductionRatio: number}>}
 */
export function phaseMinimalDisproof(state, counterexamples, opts) {
  const results = [];

  for (const cx of counterexamples) {
    const chunks = cx.input.split('\n').map((line, i) => ({
      id: i,
      content: line,
    }));

    const minimal = linearShrink(chunks, cx.test);

    if (minimal.verdict === 'RED') {
      results.push({
        invariantId: cx.invariantId,
        minimalInput: minimal.minimalInput,
        reductionRatio: minimal.reductionRatio,
      });
      state.totalDisproofs += 1;
    }
  }

  return results;
}

/**
 * PHASE IV: Admit lessons from minimal disproofs into the guidebook.
 *
 * @param {object} state
 * @param {Array<{invariantId: string, minimalInput: string}>} disproofs
 * @returns {string[]}
 */
export function phaseAdmitLessons(state, disproofs) {
  const admitted = [];

  for (const dp of disproofs) {
    const ruleId = 'auto-' + dp.invariantId + '-' + (state.guidebook.generation + 1);
    const result = admitRule(state.guidebook, {
      id: ruleId,
      description: 'Auto-admitted from minimal disproof on ' + dp.invariantId,
      pattern: escapeRegex(dp.minimalInput),
      patternKind: 'regex',
      severity: 'error',
      files: ['**/*'],
    });

    if (result.admitted) {
      admitted.push(ruleId);
      state.totalAdmissions += 1;
    }
  }

  return admitted;
}

/**
 * Run one full iteration of the unified loop.
 *
 * @param {object} state
 * @param {Array<{taskId: string, invariants: string[]}>} tasks
 * @param {string[]} agents
 * @param {Array<{agent: string, invariantId: string}>} wallHits
 * @param {Array<{invariantId: string, input: string, test: Function}>} counterexamples
 * @returns {object}
 */
export function runIteration(state, tasks, agents, wallHits, counterexamples) {
  state.generation += 1;

  const routing = phaseRoute(state, tasks, agents);
  phaseRecordWallHits(state, wallHits);
  const disproofs = phaseMinimalDisproof(state, counterexamples);
  const admissions = phaseAdmitLessons(state, disproofs);

  const iteration = {
    generation: state.generation,
    routing,
    wallHits,
    disproofs,
    admissions,
  };

  state.history.push(iteration);
  return iteration;
}

/**
 * Check convergence: the system is converging if:
 *   1. Wall hits per generation are decreasing
 *   2. Guidebook has converged (no new rules recently)
 *   3. Minimal disproofs are shrinking (better targeting)
 *
 * @param {object} state
 * @returns {{wallHitTrend: string, guidebookConverged: boolean, disproofEfficiency: number, converged: boolean}}
 */
export function convergenceMetrics(state) {
  const recent = state.history.slice(-10);
  if (recent.length < 2) {
    return {
      wallHitTrend: 'stable',
      guidebookConverged: false,
      disproofEfficiency: 1,
      converged: false,
    };
  }

  // Wall hit trend
  const firstHalf = recent.slice(0, Math.floor(recent.length / 2));
  const secondHalf = recent.slice(Math.floor(recent.length / 2));
  const firstAvg = firstHalf.reduce((s, i) => s + i.wallHits.length, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, i) => s + i.wallHits.length, 0) / secondHalf.length;

  let wallHitTrend;
  if (secondAvg < firstAvg * 0.8) wallHitTrend = 'decreasing';
  else if (secondAvg > firstAvg * 1.2) wallHitTrend = 'increasing';
  else wallHitTrend = 'stable';

  // Disproof efficiency
  const avgReduction = recent.reduce(
    (s, i) => s + i.disproofs.reduce((ss, d) => ss + d.reductionRatio, 0) / Math.max(1, i.disproofs.length),
    0,
  ) / recent.length;

  const guidebookConverged = state.generation > 10 &&
    Object.values(state.guidebook.rules).filter(
      (r) => state.generation - r.admittedAt < 5,
    ).length === 0;

  const converged = (wallHitTrend === 'decreasing' || (wallHitTrend === 'stable' && secondAvg === 0)) && guidebookConverged;

  return {
    wallHitTrend,
    guidebookConverged,
    disproofEfficiency: avgReduction,
    converged,
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
