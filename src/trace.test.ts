import { describe, it, expect } from 'vitest';
import {
  buildTrace,
  chainHashOf,
  canonicalJSON,
  writeTrace,
  resolveVerbosity,
  levelFor,
  newOperationId,
  currentSessionId,
} from './trace.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

const sha256 = (s: string): string =>
  crypto.createHash('sha256').update(s).digest('hex');

function readTrace(operationId: string, traceDir: string): Record<string, unknown> | null {
  const tracePath = path.join(traceDir, `${operationId}.json`);
  if (!fs.existsSync(tracePath)) return null;
  return JSON.parse(fs.readFileSync(tracePath, 'utf8')) as Record<string, unknown>;
}

describe('trace', () => {
  describe('canonicalJSON', () => {
    it('sorts object keys alphabetically', () => {
      const out = canonicalJSON({ zebra: 1, apple: 2, mango: 3 });
      expect(out).toBe('{"apple":2,"mango":3,"zebra":1}');
    });

    it('normalizes undefined to null', () => {
      const out = canonicalJSON({ a: undefined, b: null, c: 42 });
      expect(out).toBe('{"a":null,"b":null,"c":42}');
    });

    it('sorts nested object keys', () => {
      const out = canonicalJSON({
        outer: { innerB: true, innerA: false },
      });
      expect(out).toBe('{"outer":{"innerA":false,"innerB":true}}');
    });

    it('preserves array order', () => {
      const out = canonicalJSON({ items: [3, 1, 2] });
      expect(out).toBe('{"items":[3,1,2]}');
    });

    it('handles primitives', () => {
      expect(canonicalJSON(42)).toBe('42');
      expect(canonicalJSON('hello')).toBe('"hello"');
      expect(canonicalJSON(true)).toBe('true');
      expect(canonicalJSON(null)).toBe('null');
      expect(canonicalJSON(undefined)).toBe('null');
    });

    it('normalizes undefined inside arrays to null', () => {
      const out = canonicalJSON([undefined, 1, undefined]);
      expect(out).toBe('[null,1,null]');
    });

    it('produces identical output regardless of insertion order', () => {
      const a = canonicalJSON({ first: 1, second: 2 });
      const b = canonicalJSON({ second: 2, first: 1 });
      expect(a).toBe(b);
    });

    it('handles deeply nested structures', () => {
      const out = canonicalJSON({
        level1: {
          z: { deep: true },
          a: { deep: false },
        },
      });
      expect(out).toBe('{"level1":{"a":{"deep":false},"z":{"deep":true}}}');
    });
  });

  describe('chainHashOf', () => {
    it('produces a 64-char hex string', () => {
      const hash = chainHashOf('abc123', 'def456', undefined);
      expect(hash).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it('is deterministic for the same inputs', () => {
      const a = chainHashOf('parent', 'after', undefined);
      const b = chainHashOf('parent', 'after', undefined);
      expect(a).toBe(b);
    });

    it('differs when parentSha256 changes', () => {
      const a = chainHashOf('parentA', 'after', undefined);
      const b = chainHashOf('parentB', 'after', undefined);
      expect(a).not.toBe(b);
    });

    it('differs when afterSha256 changes', () => {
      const a = chainHashOf('parent', 'afterA', undefined);
      const b = chainHashOf('parent', 'afterB', undefined);
      expect(a).not.toBe(b);
    });

    it('differs when gateVerdict changes', () => {
      const a = chainHashOf('parent', 'after', { green: true, reds: [], notApplicable: [], unjudged: [], ran: [] });
      const b = chainHashOf('parent', 'after', { green: false, reds: [], notApplicable: [], unjudged: [], ran: ['some-gate'] });
      expect(a).not.toBe(b);
    });

    it('gateVerdict canonicalization ensures stable hash', () => {
      const a = chainHashOf('parent', 'after', { green: true, reds: [], notApplicable: [], unjudged: [], ran: [] });
      const b = chainHashOf('parent', 'after', { green: true, reds: [], notApplicable: [], unjudged: [], ran: [] });
      expect(a).toBe(b);
    });
  });

  describe('buildTrace', () => {
    it('produces a trace with all required top-level fields', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'const x = 1;',
        newText: 'const x = 2;',
        inlinePreview: 'const x = [-1-]2[+1+];',
        validation: { language: 'typescript', before: 0, after: 0 },
      });

      expect(t.traceVersion).toBe('1.0');
      expect(typeof t.operationId).toBe('string');
      expect(t.operationId.startsWith('op_')).toBe(true);
      expect(typeof t.ts).toBe('string');
      expect(t.file).toBe('src/example.ts');
      expect(t.operation).toBe('atomic_replace_text');
      expect(t.targetUnit).toBe('text_span');
      expect(typeof t.intention).toBe('string');
      expect(t.fallback).toBe(false);
      expect(typeof t.afterSha256).toBe('string');
      expect(t.afterSha256).toHaveLength(64);
      expect(typeof t.proposedSha256).toBe('string');
      expect(t.proposedSha256).toHaveLength(64);
      expect(typeof t.chainHash).toBe('string');
      expect(typeof t.parentSha256).toBe('string');
      expect(typeof t.inlinePreview).toBe('string');
      expect(t.preview).toBe(false);
      expect(t.changed).toBe(true);
    });

    it('computes correct afterSha256', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'hello',
        newText: 'world',
        inlinePreview: '[-hello-]{+world+}',
        validation: { language: 'typescript', before: 0, after: 0 },
      });
      expect(t.afterSha256).toBe(sha256('world'));
    });

    it('sets changed=false and preview=true for previews', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_preview',
        before: 'hello',
        newText: 'world',
        inlinePreview: '[-hello-]{+world+}',
        validation: { language: 'typescript', before: 0, after: 0 },
        preview: true,
      });
      expect(t.preview).toBe(true);
      expect(t.changed).toBe(false);
      expect(t.afterSha256).toBe(sha256('hello')); // rollback to before
      expect(t.rollback.available).toBe(false);
    });

    it('includes metrics when provided', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'const x = 1;',
        newText: 'const x = 2;',
        inlinePreview: 'const x = [-1-]2[+1+];',
        validation: { language: 'typescript', before: 0, after: 0 },
        metrics: { changedChars: 1, lineRewriteSurfaceChars: 12 },
      });
      expect(t.metrics.changedChars).toBe(1);
      expect(t.metrics.lineRewriteSurfaceChars).toBe(12);
      expect(typeof t.metrics.expansionFactorAvoided).toBe('number');
    });

    it('computes byteEffect correctly', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'abc',
        newText: 'abcd',
        inlinePreview: 'abc[-]{+d+}',
        validation: { language: 'typescript', before: 0, after: 0 },
      });
      expect(t.byteEffect.beforeBytes).toBe(3);
      expect(t.byteEffect.proposedBytes).toBe(4);
      expect(t.byteEffect.netBytes).toBe(1);
    });

    it('includes validation fields', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'const x = 1;',
        newText: 'const x = 2;',
        inlinePreview: 'const x = [-1-]2[+1+];',
        validation: { language: 'rust', before: 0, after: 3 },
      });
      expect(t.validation.language).toBe('rust');
      expect(t.validation.syntaxErrorsBefore).toBe(0);
      expect(t.validation.syntaxErrorsAfter).toBe(3);
    });

    it('includes preservedZones, modifiedZones, and movementZones', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'hello world',
        newText: 'hello universe',
        inlinePreview: 'hello [-world-]{+universe+}',
        validation: { language: 'typescript', before: 0, after: 0 },
      });
      expect(Array.isArray(t.preservedZones)).toBe(true);
      expect(t.preservedZones.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(t.modifiedZones)).toBe(true);
      expect(t.modifiedZones.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(t.movementZones)).toBe(true);
    });

    it('includes founder audit block', () => {
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'hello',
        newText: 'world',
        inlinePreview: '[-hello-]{+world+}',
        validation: { language: 'typescript', before: 0, after: 0 },
      });
      expect(t.audit).toBeDefined();
      expect(typeof t.audit.zeroCodeTrust).toBe('number');
      expect(typeof t.audit.promiseClass).toBe('string');
    });

    it('stores gateVerdict when provided', () => {
      const verdict = { green: true, reds: [], notApplicable: [], unjudged: [], ran: ['style-gate'] };
      const t = buildTrace({
        file: 'src/example.ts',
        operator: 'atomic_replace_text',
        before: 'hello',
        newText: 'world',
        inlinePreview: '[-hello-]{+world+}',
        validation: { language: 'typescript', before: 0, after: 0 },
        gateVerdict: verdict,
      });
      expect(t.gateVerdict).toEqual(verdict);
      expect(Array.isArray(t.decisionTree)).toBe(true);
    });
  });

  describe('writeTrace and readTrace', () => {
    it('persists a trace and recovers it via JSON read', () => {
      // Create a temp repo with .git marker so proofLedgerRootFor works
      const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-trace-test-'));
      fs.mkdirSync(path.join(tmpRepo, '.git'));

      const t = buildTrace({
        file: 'src/test-file.ts',
        operator: 'atomic_replace_text',
        before: 'const a = 1;',
        newText: 'const a = 2;',
        inlinePreview: 'const a = [-1-]2[+1+];',
        validation: { language: 'typescript', before: 0, after: 0 },
        repoRoot: tmpRepo,
      });

      const result = writeTrace(t);

      // Cleanup
      try {
        expect(result.traceWriteError).toBeUndefined();
        expect(result.tracePath).toBeDefined();
        expect(result.tracePath).toBeTruthy();

        // Read trace back from the traces directory
        const traceDir = path.join(tmpRepo, '.atomic', 'traces');
        const recovered = readTrace(t.operationId, traceDir);
        expect(recovered).not.toBeNull();
        expect(recovered).toBeDefined();

        if (!recovered) throw new Error('recovered trace was null');

        expect(recovered.traceVersion).toBe('1.0');
        expect(recovered.operationId).toBe(t.operationId);
        expect(recovered.file).toBe('src/test-file.ts');
        expect(recovered.operation).toBe('atomic_replace_text');
        expect(recovered.afterSha256).toBe(t.afterSha256);
        expect(recovered.chainHash).toBeTruthy();
        expect(recovered.chainHash).toHaveLength(64);
        expect(recovered.sessionId).toBeDefined();
      } finally {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
      }
    });

    it('chain hash is computed and non-empty on write', () => {
      const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-trace-test-'));
      fs.mkdirSync(path.join(tmpRepo, '.git'));

      const t = buildTrace({
        file: 'src/chain-test.ts',
        operator: 'atomic_replace_text',
        before: 'x',
        newText: 'y',
        inlinePreview: '[-x-]{+y+}',
        validation: { language: 'typescript', before: 0, after: 0 },
        repoRoot: tmpRepo,
      });

      const result = writeTrace(t);

      try {
        expect(result.chainHash).toBeDefined();
        expect(result.chainHash).toHaveLength(64);
        expect(result.chainHash).toBe(t.chainHash);

        // Also verify the HEAD file was written
        const headPath = path.join(tmpRepo, '.atomic', 'HEAD');
        expect(fs.existsSync(headPath)).toBe(true);
        const headContent = fs.readFileSync(headPath, 'utf8').trim();
        expect(headContent).toBe(result.chainHash);
      } finally {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
      }
    });

    it('two consecutive writes chain correctly (genesis → child)', () => {
      const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-trace-test-'));
      fs.mkdirSync(path.join(tmpRepo, '.git'));

      try {
        const t1 = buildTrace({
          file: 'src/first.ts',
          operator: 'atomic_replace_text',
          before: 'a',
          newText: 'b',
          inlinePreview: '[-a-]{+b+}',
          validation: { language: 'typescript', before: 0, after: 0 },
          repoRoot: tmpRepo,
        });

        const r1 = writeTrace(t1);
        expect(r1.traceWriteError).toBeUndefined();
        expect(r1.chainHash).toBe(t1.chainHash);

        // Genesis: parent should be empty
        expect(t1.parentSha256).toBe('');

        const t2 = buildTrace({
          file: 'src/second.ts',
          operator: 'atomic_replace_text',
          before: 'c',
          newText: 'd',
          inlinePreview: '[-c-]{+d+}',
          validation: { language: 'typescript', before: 0, after: 0 },
          repoRoot: tmpRepo,
        });

        const r2 = writeTrace(t2);
        expect(r2.traceWriteError).toBeUndefined();

        // Second trace should chain to the first
        expect(t2.parentSha256).toBe(t1.chainHash);
        expect(t2.chainHash).not.toBe(t1.chainHash);
      } finally {
        fs.rmSync(tmpRepo, { recursive: true, force: true });
      }
    });

    it('writeTrace handles invalid repo gracefully', () => {
      const t = buildTrace({
        file: 'src/nowhere.ts',
        operator: 'atomic_replace_text',
        before: 'x',
        newText: 'y',
        inlinePreview: '[-x-]{+y+}',
        validation: { language: 'typescript', before: 0, after: 0 },
        repoRoot: '/definitely/not/a/real/path',
      });

      // writeTrace catches errors and returns traceWriteError
      const result = writeTrace(t);
      // Depending on the platform, mkdirSync may throw, so we check for the error field
      // If it succeeds (unlikely), that's fine too
      if (result.traceWriteError) {
        expect(typeof result.traceWriteError).toBe('string');
      } else {
        // Somehow succeeded - clean up
        try { fs.rmSync('/definitely', { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });
  });

  describe('resolveVerbosity', () => {
    it('defaults to L1', () => {
      expect(resolveVerbosity()).toBe('L1');
    });

    it('returns explicit valid level', () => {
      expect(resolveVerbosity('L2')).toBe('L2');
      expect(resolveVerbosity('L0')).toBe('L0');
      expect(resolveVerbosity('L3')).toBe('L3');
    });

    it('falls back to L1 for invalid input', () => {
      expect(resolveVerbosity('L5')).toBe('L1');
      expect(resolveVerbosity('invalid')).toBe('L1');
    });
  });

  describe('levelFor', () => {
    it('returns L2 for preview (floors at L2 unless L3)', () => {
      expect(levelFor(true)).toBe('L2');
    });
    it('returns L3 for preview when explicit L3', () => {
      expect(levelFor(true, 'L3')).toBe('L3');
    });

    it('returns L1 for non-preview with no explicit level', () => {
      expect(levelFor(false)).toBe('L1');
    });

    it('returns explicit level over default', () => {
      expect(levelFor(false, 'L2')).toBe('L2');
    });
  });

  describe('newOperationId', () => {
    it('generates a unique id with op_ prefix', () => {
      const id = newOperationId();
      expect(id.startsWith('op_')).toBe(true);
      expect(id.length).toBeGreaterThan('op_'.length);
    });

    it('generates unique ids on each call', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(newOperationId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('currentSessionId', () => {
    it('returns a consistent id across calls', () => {
      const a = currentSessionId();
      const b = currentSessionId();
      expect(a).toBe(b);
      expect(a.startsWith('sess_')).toBe(true);
    });
  });
});
