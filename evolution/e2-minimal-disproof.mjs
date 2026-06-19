/**
 * e2-minimal-disproof.mjs — PARADIGM PART D.3 / E2: minimal recomputable disproof core.
 *
 * When a gate returns RED, delta-debug the failing input to find the SMALLEST
 * reproducing counterexample. The minimal counterexample becomes the disproof
 * briefing — maximally informative, minimal in size, recomputable by third parties.
 *
 * Algorithm: binary-search delta debugging (ddmin) over the input components.
 *   - Split the failing input into N chunks
 *   - Test subsets: if any subset still fails, recurse into it
 *   - If no subset fails alone, test complements
 *   - Result: 1-minimal failing input (removing any single element makes it pass)
 *
 * Pure functions — no side effects.
 */

/**
 * Concatenate chunks by indices into a string.
 */
function concatChunks(chunks, indices) {
  return indices.map((i) => chunks[i]?.content ?? '').join('\n');
}

/**
 * Delta-debug: find a 1-minimal subset of chunks that still reproduces the failure.
 *
 * ddmin algorithm (Zeller & Hildebrandt, 2002):
 *   1. If the full input fails, start with all chunks
 *   2. Split into N subsets; test each
 *   3. If any subset fails → recurse into it
 *   4. If no subset fails alone, test complements
 *   5. If a complement fails → that means some OTHER subset is irrelevant; remove it
 *   6. Repeat with increasing granularity until 1-minimal
 *
 * @param {Array<{id: (string|number), content: string}>} chunks
 * @param {(input: string) => {red: boolean}|undefined} test
 * @param {number} [maxTests]
 * @returns {{minimalInput: string, minimalChunks: number[], testsPerformed: number, reductionRatio: number, verdict: 'RED'|'TEST_FAILED'}}
 */
export function deltaDebugMinimal(chunks, test, maxTests) {
  const max = maxTests ?? 500;
  let testsPerformed = 0;

  // Verify the full input actually fails
  const fullInput = concatChunks(chunks, chunks.map((_, i) => i));
  const fullResult = test(fullInput);
  testsPerformed += 1;

  if (!fullResult || !fullResult.red) {
    return {
      minimalInput: fullInput,
      minimalChunks: [],
      testsPerformed,
      reductionRatio: 1,
      verdict: fullResult ? 'TEST_FAILED' : 'TEST_FAILED',
    };
  }

  // Start with all chunk indices
  let current = chunks.map((_, i) => i);
  let granularity = 2;

  while (granularity <= current.length && testsPerformed < max) {
    const subsetSize = Math.max(1, Math.floor(current.length / granularity));
    let progress = false;

    // Try each subset
    for (let start = 0; start < current.length; start += subsetSize) {
      if (testsPerformed >= max) break;

      const subset = current.slice(start, start + subsetSize);
      const complement = current.filter((_, i) => i < start || i >= start + subsetSize);

      // Test the subset: if it still fails, reduce to it
      const subsetInput = concatChunks(chunks, subset);
      const subsetResult = test(subsetInput);
      testsPerformed += 1;

      if (subsetResult?.red) {
        current = subset;
        granularity = 2;
        progress = true;
        break;
      }

      // Test the complement: if it fails, the subset is irrelevant
      if (complement.length > 0) {
        const compInput = concatChunks(chunks, complement);
        const compResult = test(compInput);
        testsPerformed += 1;

        if (compResult?.red) {
          current = complement;
          granularity = Math.max(2, granularity - 1);
          progress = true;
          break;
        }
      }
    }

    if (!progress) {
      // Increase granularity: try smaller subsets
      if (granularity >= current.length) break;
      granularity = Math.min(current.length, granularity * 2);
    }
  }

  const minimalInput = concatChunks(chunks, current);
  return {
    minimalInput,
    minimalChunks: current,
    testsPerformed,
    reductionRatio: chunks.length / Math.max(1, current.length),
    verdict: 'RED',
  };
}

/**
 * Quick shrink: remove one chunk at a time (linear pass).
 * Faster than ddmin for small inputs or when the failure is concentrated.
 *
 * @param {Array<{id: (string|number), content: string}>} chunks
 * @param {(input: string) => {red: boolean}|undefined} test
 * @returns {{minimalInput: string, minimalChunks: number[], testsPerformed: number, reductionRatio: number, verdict: 'RED'|'TEST_FAILED'}}
 */
export function linearShrink(chunks, test) {
  let testsPerformed = 1;
  const fullInput = concatChunks(chunks, chunks.map((_, i) => i));
  const fullResult = test(fullInput);

  if (!fullResult?.red) {
    return {
      minimalInput: fullInput,
      minimalChunks: [],
      testsPerformed,
      reductionRatio: 1,
      verdict: 'TEST_FAILED',
    };
  }

  let current = [...chunks.map((_, i) => i)];
  let changed = true;

  while (changed) {
    changed = false;
    for (let i = current.length - 1; i >= 0; i--) {
      const candidate = [...current.slice(0, i), ...current.slice(i + 1)];
      if (candidate.length === 0) continue;

      const input = concatChunks(chunks, candidate);
      const result = test(input);
      testsPerformed += 1;

      if (result?.red) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }

  return {
    minimalInput: concatChunks(chunks, current),
    minimalChunks: current,
    testsPerformed,
    reductionRatio: chunks.length / Math.max(1, current.length),
    verdict: 'RED',
  };
}
