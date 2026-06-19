import { describe, expect, it } from 'vitest';
import {
  removedRegion,
  recomputeDisproof,
  removedByteCountBetween,
  requireNegativeActionProof,
} from './server-helpers-negative-proof.js';
import type {
  DisproofWitness,
  NegativeActionProofRequest,
} from './server-helpers-negative-proof.js';

// ── removedRegion ────────────────────────────────────────────────────────────

describe('removedRegion', () => {
  it('returns empty for identical strings', () => {
    expect(removedRegion('hello', 'hello')).toBe('');
  });

  it('returns empty for two empty strings', () => {
    expect(removedRegion('', '')).toBe('');
  });

  it('returns full after when nothing in common', () => {
    expect(removedRegion('abc', 'xyz')).toBe('abc');
  });

  it('returns middle when common prefix and suffix differ', () => {
    expect(removedRegion('axxxxb', 'ayyyyb')).toBe('xxxx');
  });

  it('handles common prefix only (after is shorter)', () => {
    expect(removedRegion('abcdef', 'abc')).toBe('def');
  });

  it('handles common prefix only (before is shorter)', () => {
    expect(removedRegion('abc', 'abcdef')).toBe('');
  });

  it('handles common suffix only', () => {
    expect(removedRegion('xyzabc', 'defabc')).toBe('xyz');
  });

  it('handles single-char removal', () => {
    expect(removedRegion('abc', 'ac')).toBe('b');
  });

  it('handles multi-byte UTF-8 characters', () => {
    expect(removedRegion('café noir', 'café blanc')).toBe('noir');
  });

  it('returns full before when after is empty', () => {
    expect(removedRegion('hello world', '')).toBe('hello world');
  });

  it('prefix overlaps into the removal zone correctly', () => {
    // "ab" prefix, " yz" suffix (common to both) → removed middle "cdefgwx"
    expect(removedRegion('abcdefgwx yz', 'ab yz')).toBe('cdefgwx');
  });
});

// ── recomputeDisproof ────────────────────────────────────────────────────────

describe('recomputeDisproof', () => {
  it('returns asserted verdict when no witness provided', () => {
    const result = recomputeDisproof(undefined, 'x', 'y');
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('asserted');
    expect(result.recomputed).toBe(false);
    expect(result.readLoci).toEqual([]);
  });

  describe('duplicate witness', () => {
    it('validates a true duplicate (removed region still in after)', () => {
      // The removed bytes "ABC" appear again later in `after` — a real duplicate
      const before = 'const ABC = 1;\nconst ABC = 1;\n';
      const after = 'const ABC = 1;\n';
      const witness: DisproofWitness = { kind: 'duplicate' };

      const result = recomputeDisproof(witness, before, after);
      expect(result.ok).toBe(true);
      expect(result.kind).toBe('duplicate');
      expect(result.recomputed).toBe(true);
    });

    it('rejects a false duplicate (removed region NOT in after)', () => {
      const before = 'function removed() {}\n';
      const after = 'function other() {}\n';
      const witness: DisproofWitness = { kind: 'duplicate' };

      const result = recomputeDisproof(witness, before, after);
      expect(result.ok).toBe(false);
      expect(result.kind).toBe('duplicate');
      expect(result.recomputed).toBe(false);
    });

    it('rejects when before or after is undefined', () => {
      const witness: DisproofWitness = { kind: 'duplicate' };

      const result1 = recomputeDisproof(witness, undefined, 'after');
      expect(result1.ok).toBe(false);
      expect(result1.kind).toBe('duplicate');

      const result2 = recomputeDisproof(witness, 'before', undefined);
      expect(result2.ok).toBe(false);
      expect(result2.kind).toBe('duplicate');
    });

    it('rejects when removed region is empty (nothing removed)', () => {
      const before = 'same text';
      const after = 'same text';
      const witness: DisproofWitness = { kind: 'duplicate' };

      const result = recomputeDisproof(witness, before, after);
      expect(result.ok).toBe(false);
    });

    it('passes readLoci through from witness', () => {
      const before = 'X removed Z';
      const after = 'X Y removed Z Z';
      const witness: DisproofWitness = { kind: 'duplicate', readLoci: ['loc1', 'loc2'] };

      const result = recomputeDisproof(witness, before, after);
      expect(result.ok).toBe(true);
      expect(result.readLoci).toEqual(['loc1', 'loc2']);
    });

    it('defaults readLoci to empty array when not provided', () => {
      const before = 'X removed Z';
      const after = 'X Y removed Z Z';
      const witness: DisproofWitness = { kind: 'duplicate' };

      const result = recomputeDisproof(witness, before, after);
      expect(result.ok).toBe(true);
      expect(result.readLoci).toEqual([]);
    });
  });

  describe('gate-red witness', () => {
    it('validates a well-formed gate-red witness', () => {
      const witness: DisproofWitness = {
        kind: 'gate-red',
        gate: 'security-check',
        readLoci: ['loc1'],
      };

      const result = recomputeDisproof(witness, 'before', 'after');
      expect(result.ok).toBe(true);
      expect(result.kind).toBe('gate-red');
      expect(result.recomputed).toBe(true);
    });

    it('rejects gate-red with missing gate name', () => {
      const witness: DisproofWitness = {
        kind: 'gate-red',
        gate: '',
        readLoci: ['loc1'],
      };

      const result = recomputeDisproof(witness, 'before', 'after');
      expect(result.ok).toBe(false);
    });

    it('rejects gate-red with empty readLoci', () => {
      const witness: DisproofWitness = {
        kind: 'gate-red',
        gate: 'check',
        readLoci: [],
      };

      const result = recomputeDisproof(witness, 'before', 'after');
      expect(result.ok).toBe(false);
    });

    it('rejects gate-red with undefined readLoci', () => {
      const witness: DisproofWitness = {
        kind: 'gate-red',
        gate: 'check',
        readLoci: undefined,
      };

      const result = recomputeDisproof(witness, 'before', 'after');
      expect(result.ok).toBe(false);
    });

    it('rejects gate-red with undefined gate', () => {
      const witness = {
        kind: 'gate-red',
        readLoci: ['loc1'],
      } as DisproofWitness;

      const result = recomputeDisproof(witness, 'before', 'after');
      expect(result.ok).toBe(false);
    });
  });

  it('returns ok:false for unknown witness kind', () => {
    const witness = { kind: 'unknown-kind' } as unknown as DisproofWitness;

    const result = recomputeDisproof(witness, 'before', 'after');
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('asserted');
  });
});

// ── removedByteCountBetween ──────────────────────────────────────────────────

describe('removedByteCountBetween', () => {
  it('returns 0 for identical strings', () => {
    expect(removedByteCountBetween('hello', 'hello')).toBe(0);
  });

  it('returns 0 for empty strings', () => {
    expect(removedByteCountBetween('', '')).toBe(0);
  });

  it('returns 0 when after is a superset (growth only)', () => {
    // Growing: all before bytes still exist in after
    expect(removedByteCountBetween('abc', 'abcde')).toBe(0);
  });

  it('returns 0 for pure permutation (same multiset)', () => {
    expect(removedByteCountBetween('abc', 'cba')).toBe(0);
  });

  it('counts genuinely removed bytes', () => {
    // 'b' is removed (before has 'b', after doesn't)
    expect(removedByteCountBetween('abc', 'ac')).toBe(1);
  });

  it('counts multiple removed bytes', () => {
    expect(removedByteCountBetween('hello world', 'hello')).toBe(6); // " world" = 6 chars
  });

  it('counts partial removal correctly', () => {
    // "xyz" removed from before, "b" added — 3 removed, 1 added, net diff not simple
    expect(removedByteCountBetween('abcxyz', 'abcb')).toBe(3); // x, y, z removed
  });

  it('handles duplicate byte removal', () => {
    // 'aa' in before, only one 'a' survives in after
    expect(removedByteCountBetween('baab', 'bab')).toBe(1);
  });

  it('handles multi-byte UTF-8 correctly (counts bytes, not chars)', () => {
    // "ñ" = 2 UTF-8 bytes (0xC3 0xB1)
    expect(removedByteCountBetween('niño', 'nino')).toBe(2);
  });

  it('returns 0 when before is empty', () => {
    expect(removedByteCountBetween('', 'anything')).toBe(0);
  });

  it('returns full before length when after is empty', () => {
    expect(removedByteCountBetween('hello', '')).toBe(5);
  });
});

// ── requireNegativeActionProof ───────────────────────────────────────────────

describe('requireNegativeActionProof', () => {
  const buildRequest = (overrides: Partial<NegativeActionProofRequest> = {}): NegativeActionProofRequest => ({
    action: 'remove',
    target: 'src/test.ts',
    targetUnit: 'test',
    removedByteCount: 10,
    before: 'function oldCode() { return 1; }',
    after: 'function newCode() { return 2; }',
    ...overrides,
  });

  describe('proof length requirements', () => {
    it('refuses proofs < 200 chars when no witness provided', () => {
      const req = buildRequest({ proofOfIncorrectness: 'too short' });
      expect(() => requireNegativeActionProof(req)).toThrow(/>=200/);
    });

    it('accepts proofs >= 200 chars with token matching', () => {
      const proof = `This function is incorrect because oldCode does not compute the right result.
The return value is wrong and the function name oldCode is misleading. The new implementation
newCode correctly handles the edge case where the input is zero or negative, which oldCode
failed to account for in its original design specification.`;

      const req = buildRequest({
        proofOfIncorrectness: proof,
        before: 'function oldCode() { return 1; }\n',
        after: 'function newCode() { return 2; }\n',
      });
      const result = requireNegativeActionProof(req);
      expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
      expect(result.witnessKind).toBe('asserted');
      expect(result.recomputed).toBe(false);
    });

    it('refuses proofs >= 200 chars that lack token matches', () => {
      // Proof mentions noremoved region tokens at all
      const proof = 'x'.repeat(100) + ' ' + 'y'.repeat(100);
      const req = buildRequest({
        proofOfIncorrectness: proof,
        before: 'function oldCode() { return 1; }\n',
        after: 'function newCode() { return 2; }\n',
      });
      expect(() => requireNegativeActionProof(req)).toThrow(
        /must reference at least one code token/,
      );
    });

    it('accepts proofs >= 200 chars without before/after (no token check)', () => {
      const proof = 'x'.repeat(200);
      const req = buildRequest({
        proofOfIncorrectness: proof,
        before: undefined,
        after: undefined,
      });
      const result = requireNegativeActionProof(req);
      expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
    });

    it('skips token matching when removed region is empty', () => {
      const proof = 'x'.repeat(200);
      const req = buildRequest({
        proofOfIncorrectness: proof,
        before: 'same',
        after: 'same',
        removedByteCount: 1, // override to keep it > 0
      });
      // removed region is empty → token check is skipped → proof accepted
      const result = requireNegativeActionProof(req);
      expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
    });
  });

  describe('witness-backed proofs (shorter proof OK)', () => {
    it('accepts short proof with valid duplicate witness', () => {
      const before = 'X removed Z';
      const after = 'X Y removed Z Z';
      const req = buildRequest({
        proofOfIncorrectness: 'dup removal',
        before,
        after,
        disproofWitness: { kind: 'duplicate' },
        removedByteCount: 1,
      });
      const result = requireNegativeActionProof(req);
      expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
      expect(result.witnessKind).toBe('duplicate');
      expect(result.recomputed).toBe(true);
    });

    it('refuses false duplicate witness', () => {
      const before = 'function removed() {}\n';
      const after = 'function other() {}\n';
      const req = buildRequest({
        proofOfIncorrectness: 'This removal is a dedup, the code still exists',
        before,
        after,
        disproofWitness: { kind: 'duplicate' },
      });
      expect(() => requireNegativeActionProof(req)).toThrow(
        /does NOT hold against the removed bytes/,
      );
    });

    it('refuses proof < 10 chars even with witness', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'short',
        disproofWitness: { kind: 'duplicate' },
      });
      expect(() => requireNegativeActionProof(req)).toThrow(/>=10/);
    });

    it('accepts valid gate-red witness', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'gate failure detected',
        disproofWitness: { kind: 'gate-red', gate: 'lint', readLoci: ['loc1'] },
      });
      const result = requireNegativeActionProof(req);
      expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
      expect(result.witnessKind).toBe('gate-red');
      expect(result.recomputed).toBe(true);
    });

    it('refuses invalid gate-red witness (empty readLoci)', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'gate failure detected, but no loci',
        disproofWitness: { kind: 'gate-red', gate: 'lint', readLoci: [] },
      });
      expect(() => requireNegativeActionProof(req)).toThrow(
        /does NOT hold against the removed bytes/,
      );
    });
  });

  describe('removedByteCount validation', () => {
    it('refuses zero removedByteCount', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'x'.repeat(200),
        removedByteCount: 0,
        before: undefined,
        after: undefined,
      });
      expect(() => requireNegativeActionProof(req)).toThrow(
        /did not identify any negative bytes/,
      );
    });

    it('refuses negative removedByteCount', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'x'.repeat(200),
        removedByteCount: -5,
        before: undefined,
        after: undefined,
      });
      expect(() => requireNegativeActionProof(req)).toThrow(
        /did not identify any negative bytes/,
      );
    });

    it('floors fractional removedByteCount', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'x'.repeat(200),
        removedByteCount: 10.7,
        before: undefined,
        after: undefined,
      });
      const result = requireNegativeActionProof(req);
      expect(result.removedByteCount).toBe(10);
    });
  });

  describe('proofSha256 and receipt fields', () => {
    it('computes proofSha256 correctly', () => {
      const proof = 'x'.repeat(200);
      const req = buildRequest({
        proofOfIncorrectness: proof,
        before: undefined,
        after: undefined,
      });
      const result = requireNegativeActionProof(req);
      expect(result.proof).toBe(proof);
      expect(result.proofLength).toBe(200);
      expect(result.proofSha256).toBeTruthy();
      expect(result.proofSha256).toHaveLength(64); // sha256 hex
    });

    it('includes readLoci when witness provides them', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'gate-triggered removal proof here',
        disproofWitness: { kind: 'gate-red', gate: 'audit', readLoci: ['a1', 'b2'] },
      });
      const result = requireNegativeActionProof(req);
      expect(result.readLoci).toEqual(['a1', 'b2']);
    });

    it('omits readLoci when witness has none', () => {
      const req = buildRequest({
        proofOfIncorrectness: 'x'.repeat(200),
        before: undefined,
        after: undefined,
      });
      const result = requireNegativeActionProof(req);
      expect(result.readLoci).toBeUndefined();
    });
  });
});

// ── extractSignificantTokens (tested indirectly through requireNegativeActionProof) ──

describe('extractSignificantTokens (via requireNegativeActionProof)', () => {
  const longProof = 'x'.repeat(200);

  it('accepts proof that references a function name from removed region', () => {
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 5,
      before: 'function calculateTotal() {}\n',
      after: '\n',
      proofOfIncorrectness:
        longProof + ' The calculateTotal function was redundant and duplicated elsewhere.',
    };
    const result = requireNegativeActionProof(req);
    expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
  });

  it('accepts proof that references a variable name from removed region', () => {
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 5,
      before: 'const MAX_RETRIES = 3;\n',
      after: '\n',
      proofOfIncorrectness:
        longProof + ' MAX_RETRIES was set too low and the constant is no longer needed.',
    };
    const result = requireNegativeActionProof(req);
    expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
  });

  it('refuses proof that references no token from removed region', () => {
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 5,
      before: 'function secretInternalHelper() {}\n',
      after: '\n',
      proofOfIncorrectness:
        longProof +
        ' this is wrong because I said so and completely irrelevant filler text without any matching tokens.',
    };
    expect(() => requireNegativeActionProof(req)).toThrow(
      /must reference at least one code token/,
    );
  });

  it('skips short tokens (< 4 chars) in matching', () => {
    // "foo" is 3 chars — too short to be a significant token
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 3,
      before: 'const foo = 1;\n',
      after: '\n',
      proofOfIncorrectness: longProof + ' the foo variable should not be here.',
    };
    expect(() => requireNegativeActionProof(req)).toThrow(
      /must reference at least one code token/,
    );
  });

  it('matches tokens that are substrings of longer identifiers', () => {
    // "setup" is a substring of "setupDatabase" — extractSignificantTokens extracts
    // the full identifiers, but the proof only needs one match
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 5,
      before: 'function setupDatabase() {}\n',
      after: '\n',
      proofOfIncorrectness: longProof + ' The setupDatabase call is redundant.',
    };
    const result = requireNegativeActionProof(req);
    expect(result.verdict).toBe('NEGATIVE_BYTES_ADMITTED');
  });

  it('shows up to 5 removed tokens in the error message', () => {
    const req: NegativeActionProofRequest = {
      action: 'remove',
      target: 'src/test.ts',
      targetUnit: 'test',
      removedByteCount: 5,
      before: 'function alpha() {}\nfunction beta() {}\nfunction gamma() {}\n',
      after: '\n',
      proofOfIncorrectness: longProof + ' no matching tokens here at all sorry.',
    };
    expect(() => requireNegativeActionProof(req)).toThrow(/alpha/);
    expect(() => requireNegativeActionProof(req)).toThrow(/beta/);
    expect(() => requireNegativeActionProof(req)).toThrow(/gamma/);
  });
});
