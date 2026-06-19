import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  captureEffectSnapshot,
  diffEffect,
  rollbackEffect,
  assertCompleteEffectSnapshot,
} from './server-helpers-effect.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let workDir: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'effect-test-'));
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function writeFile(rel: string, content: string): string {
  const full = path.join(workDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
}

function readFile(rel: string): string | null {
  const full = path.join(workDir, rel);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

describe('captureEffectSnapshot', () => {
  it('captures file content and mode for all files in a directory', () => {
    const sub = path.join(workDir, 'cap-all');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'a.txt')), 'hello');
    writeFile(path.relative(workDir, path.join(sub, 'b.txt')), 'world');

    const snap = captureEffectSnapshot(sub);

    expect(snap.limitReached).toBe(false);
    expect(snap.files.size).toBe(2);
    // Paths are repo-relative from rootAbs; since sub is a temp dir,
    // paths are relative to sub itself.
    expect(snap.files.get('a.txt')).toBe('hello');
    expect(snap.files.get('b.txt')).toBe('world');
    expect(snap.modes?.has('a.txt')).toBe(true);
    expect(snap.modes?.has('b.txt')).toBe(true);
  });

  it('captures files in nested directories', () => {
    const sub = path.join(workDir, 'cap-nested');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'src', 'index.ts')), 'export const x = 1;');
    writeFile(path.relative(workDir, path.join(sub, 'src', 'lib', 'util.ts')), 'export const y = 2;');

    const snap = captureEffectSnapshot(sub);

    expect(snap.limitReached).toBe(false);
    expect(snap.files.size).toBe(2);
    expect(snap.files.get('src/index.ts')).toBe('export const x = 1;');
    expect(snap.files.get('src/lib/util.ts')).toBe('export const y = 2;');
  });

  it('skips node_modules and .git directories', () => {
    const sub = path.join(workDir, 'cap-skip-dirs');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'root.txt')), 'root');
    writeFile(path.relative(workDir, path.join(sub, 'node_modules', 'pkg', 'index.js')), 'bad');
    writeFile(path.relative(workDir, path.join(sub, '.git', 'config')), 'bad');
    writeFile(path.relative(workDir, path.join(sub, 'dist', 'out.js')), 'bad');

    const snap = captureEffectSnapshot(sub);

    expect(snap.limitReached).toBe(false);
    expect(snap.files.size).toBe(1);
    expect(snap.files.get('root.txt')).toBe('root');
    expect(snap.files.has('node_modules/pkg/index.js')).toBe(false);
    expect(snap.files.has('.git/config')).toBe(false);
    expect(snap.files.has('dist/out.js')).toBe(false);
  });

  it('skips .DS_Store files', () => {
    const sub = path.join(workDir, 'cap-skip-files');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'good.txt')), 'ok');
    writeFile(path.relative(workDir, path.join(sub, '.DS_Store')), 'bad');

    const snap = captureEffectSnapshot(sub);

    expect(snap.files.size).toBe(1);
    expect(snap.files.has('good.txt')).toBe(true);
    expect(snap.files.has('.DS_Store')).toBe(false);
  });

  it('respects maxFiles limit', () => {
    const sub = path.join(workDir, 'cap-maxfiles');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, '1.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, '2.txt')), 'b');
    writeFile(path.relative(workDir, path.join(sub, '3.txt')), 'c');

    const snap = captureEffectSnapshot(sub, { maxFiles: 2 });

    // With maxFiles=2, we might only capture 2 files. The limitReached flag
    // should be set because there are more files than the limit.
    expect(snap.files.size).toBeLessThanOrEqual(2);
    expect(snap.limitReached).toBe(true);
    expect(snap.limits.maxFiles).toBe(2);
  });

  it('respects maxBytes limit', () => {
    const sub = path.join(workDir, 'cap-maxbytes');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'big.txt')), 'x'.repeat(100));
    writeFile(path.relative(workDir, path.join(sub, 'small.txt')), 'y');

    const snap = captureEffectSnapshot(sub, { maxBytes: 50 });

    // Regardless of directory order, at most one file fits under 50 bytes.
    // The snapshot should have hit the limit.
    expect(snap.files.size).toBeLessThanOrEqual(1);
    expect(snap.limitReached).toBe(true);
    expect(snap.limits.maxBytes).toBe(50);
  });

  it('respects maxFileBytes limit (large files trigger limitReached)', () => {
    const sub = path.join(workDir, 'cap-maxfilebytes');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'tiny.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, 'huge.txt')), 'x'.repeat(5000));

    const snap = captureEffectSnapshot(sub, { maxFileBytes: 100 });

    // The huge file should cause limitReached because it exceeds maxFileBytes.
    expect(snap.limitReached).toBe(true);
    // tiny.txt should still be captured (it was processed before or after the skip).
    expect(snap.files.has('tiny.txt')).toBe(true);
    // huge.txt should NOT be in the snapshot.
    expect(snap.files.has('huge.txt')).toBe(false);
  });

  it('captures only specified includeRel paths', () => {
    const sub = path.join(workDir, 'cap-include');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'src', 'a.ts')), 'a');
    writeFile(path.relative(workDir, path.join(sub, 'src', 'b.ts')), 'b');
    writeFile(path.relative(workDir, path.join(sub, 'test', 'a.test.ts')), 'test');

    const snap = captureEffectSnapshot(sub, { includeRel: ['src'] });

    expect(snap.limitReached).toBe(false);
    expect(snap.files.size).toBe(2);
    expect(snap.files.has('src/a.ts')).toBe(true);
    expect(snap.files.has('src/b.ts')).toBe(true);
    expect(snap.files.has('test/a.test.ts')).toBe(false);
    expect(snap.includeRel).toEqual(['src']);
  });

  it('includeRel with a single file captures just that file', () => {
    const sub = path.join(workDir, 'cap-include-file');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'a.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, 'b.txt')), 'b');

    const snap = captureEffectSnapshot(sub, { includeRel: ['a.txt'] });

    expect(snap.files.size).toBe(1);
    expect(snap.files.has('a.txt')).toBe(true);
    expect(snap.files.has('b.txt')).toBe(false);
  });

  it('reports default limit values', () => {
    const sub = path.join(workDir, 'cap-defaults');
    fs.mkdirSync(sub, { recursive: true });

    const snap = captureEffectSnapshot(sub);

    expect(snap.limits.maxFiles).toBe(20000);
    expect(snap.limits.maxBytes).toBe(256 * 1024 * 1024);
    expect(snap.limits.maxFileBytes).toBe(2 * 1024 * 1024);
  });
});

describe('diffEffect', () => {
  it('detects newly created files', () => {
    const sub = path.join(workDir, 'diff-created');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'original.txt')), 'before');

    const snap = captureEffectSnapshot(sub);
    writeFile(path.relative(workDir, path.join(sub, 'new.txt')), 'created');

    const effects = diffEffect(snap);
    const created = effects.filter((e) => e.change === 'created');
    expect(created.length).toBe(1);
    expect(created[0].file).toBe('new.txt');
    expect(created[0].bytesBefore).toBe(0);
    expect(created[0].bytesAfter).toBeGreaterThan(0);
  });

  it('detects modified files', () => {
    const sub = path.join(workDir, 'diff-modified');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'mod.txt')), 'before');

    const snap = captureEffectSnapshot(sub);
    writeFile(path.relative(workDir, path.join(sub, 'mod.txt')), 'after edit');

    const effects = diffEffect(snap);
    const modified = effects.filter((e) => e.change === 'modified');
    expect(modified.length).toBe(1);
    expect(modified[0].file).toBe('mod.txt');
    expect(modified[0].bytesBefore).toBe(6); // 'before'.length
    expect(modified[0].bytesAfter).toBe(10); // 'after edit'.length
    expect(modified[0].atomicDiff).toBeDefined();
  });

  it('detects deleted files', () => {
    const sub = path.join(workDir, 'diff-deleted');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'remove.txt')), 'to be deleted');

    const snap = captureEffectSnapshot(sub);
    fs.unlinkSync(path.join(sub, 'remove.txt'));

    const effects = diffEffect(snap);
    const deleted = effects.filter((e) => e.change === 'deleted');
    expect(deleted.length).toBe(1);
    expect(deleted[0].file).toBe('remove.txt');
    expect(deleted[0].bytesBefore).toBeGreaterThan(0);
    expect(deleted[0].bytesAfter).toBe(0);
  });

  it('returns empty array when nothing changed', () => {
    const sub = path.join(workDir, 'diff-unchanged');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'same.txt')), 'content');

    const snap = captureEffectSnapshot(sub);
    // No changes at all.

    const effects = diffEffect(snap);
    expect(effects.length).toBe(0);
  });

  it('detects mode-only changes as metadataOnly', () => {
    const sub = path.join(workDir, 'diff-mode');
    fs.mkdirSync(sub, { recursive: true });
    const f = writeFile(path.relative(workDir, path.join(sub, 'perm.txt')), 'content');
    // Set a known mode so the snapshot captures it.
    fs.chmodSync(f, 0o644);

    const snap = captureEffectSnapshot(sub);
    fs.chmodSync(f, 0o755);

    const effects = diffEffect(snap);
    const modified = effects.filter((e) => e.change === 'modified');
    expect(modified.length).toBe(1);
    expect(modified[0].file).toBe('perm.txt');
    expect(modified[0].metadataOnly).toBe(true);
    expect(modified[0].modeBefore).toBe(0o644);
    expect(modified[0].modeAfter).toBe(0o755);
  });

  it('throws when snapshot limit was reached', () => {
    const sub = path.join(workDir, 'diff-limit');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, '1.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, '2.txt')), 'b');
    writeFile(path.relative(workDir, path.join(sub, '3.txt')), 'c');

    const snap = captureEffectSnapshot(sub, { maxFiles: 2 });
    expect(snap.limitReached).toBe(true);

    expect(() => diffEffect(snap)).toThrow(/incomplete/);
  });
});

describe('rollbackEffect', () => {
  it('removes newly created files', () => {
    const sub = path.join(workDir, 'rollback-created');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'keep.txt')), 'keep');

    const snap = captureEffectSnapshot(sub);
    const fullNew = writeFile(path.relative(workDir, path.join(sub, 'temp.txt')), 'temporary');

    const effects = diffEffect(snap);
    const created = effects.filter((e) => e.change === 'created');
    expect(created.length).toBe(1);
    expect(fs.existsSync(fullNew)).toBe(true);

    const restored = rollbackEffect(snap, effects);
    expect(restored).toBe(1);
    expect(fs.existsSync(fullNew)).toBe(false);
  });

  it('restores modified files to snapshot content', () => {
    const sub = path.join(workDir, 'rollback-modified');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'edit.txt')), 'original');

    const snap = captureEffectSnapshot(sub);
    writeFile(path.relative(workDir, path.join(sub, 'edit.txt')), 'changed content');

    const effects = diffEffect(snap);
    const modified = effects.filter((e) => e.change === 'modified');
    expect(modified.length).toBe(1);
    expect(readFile(path.relative(workDir, path.join(sub, 'edit.txt')))).toBe('changed content');

    const restored = rollbackEffect(snap, effects);
    expect(restored).toBe(1);
    expect(readFile(path.relative(workDir, path.join(sub, 'edit.txt')))).toBe('original');
  });

  it('recreates deleted files', () => {
    const sub = path.join(workDir, 'rollback-deleted');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'gone.txt')), 'will be deleted');

    const snap = captureEffectSnapshot(sub);
    fs.unlinkSync(path.join(sub, 'gone.txt'));

    const effects = diffEffect(snap);
    const deleted = effects.filter((e) => e.change === 'deleted');
    expect(deleted.length).toBe(1);
    expect(readFile(path.relative(workDir, path.join(sub, 'gone.txt')))).toBeNull();

    const restored = rollbackEffect(snap, effects);
    expect(restored).toBe(1);
    expect(readFile(path.relative(workDir, path.join(sub, 'gone.txt')))).toBe('will be deleted');
  });

  it('restores multiple types of changes in one pass', () => {
    const sub = path.join(workDir, 'rollback-multi');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'mod.txt')), 'original');
    writeFile(path.relative(workDir, path.join(sub, 'del.txt')), 'to delete');

    const snap = captureEffectSnapshot(sub);
    writeFile(path.relative(workDir, path.join(sub, 'mod.txt')), 'changed');
    fs.unlinkSync(path.join(sub, 'del.txt'));
    writeFile(path.relative(workDir, path.join(sub, 'new.txt')), 'new');

    const effects = diffEffect(snap);
    expect(effects.length).toBe(3);

    const restored = rollbackEffect(snap, effects);
    expect(restored).toBe(3);
    expect(readFile(path.relative(workDir, path.join(sub, 'mod.txt')))).toBe('original');
    expect(readFile(path.relative(workDir, path.join(sub, 'del.txt')))).toBe('to delete');
    expect(readFile(path.relative(workDir, path.join(sub, 'new.txt')))).toBeNull();
  });

  it('returns 0 when no effects to rollback', () => {
    const sub = path.join(workDir, 'rollback-none');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'a.txt')), 'content');

    const snap = captureEffectSnapshot(sub);
    const effects = diffEffect(snap); // empty
    expect(effects.length).toBe(0);

    const restored = rollbackEffect(snap, effects);
    expect(restored).toBe(0);
  });

  it('throws when snapshot limit was reached', () => {
    const sub = path.join(workDir, 'rollback-limit');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, '1.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, '2.txt')), 'b');
    writeFile(path.relative(workDir, path.join(sub, '3.txt')), 'c');

    const snap = captureEffectSnapshot(sub, { maxFiles: 2 });
    expect(snap.limitReached).toBe(true);

    expect(() => rollbackEffect(snap, [])).toThrow(/incomplete/);
  });
});

describe('assertCompleteEffectSnapshot', () => {
  it('does not throw when limitReached is false', () => {
    const sub = path.join(workDir, 'assert-ok');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, 'a.txt')), 'content');

    const snap = captureEffectSnapshot(sub);
    expect(snap.limitReached).toBe(false);

    expect(() => assertCompleteEffectSnapshot(snap, 'test action')).not.toThrow();
  });

  it('throws when limitReached is true', () => {
    const sub = path.join(workDir, 'assert-throw');
    fs.mkdirSync(sub, { recursive: true });
    writeFile(path.relative(workDir, path.join(sub, '1.txt')), 'a');
    writeFile(path.relative(workDir, path.join(sub, '2.txt')), 'b');
    writeFile(path.relative(workDir, path.join(sub, '3.txt')), 'c');

    const snap = captureEffectSnapshot(sub, { maxFiles: 2 });
    expect(snap.limitReached).toBe(true);

    expect(() => assertCompleteEffectSnapshot(snap, 'diff')).toThrow(/incomplete/);
  });

  it('includes the action name in the error message', () => {
    const snap = {
      rootAbs: '/tmp/test',
      files: new Map(),
      limitReached: true,
      limits: { maxFiles: 1, maxBytes: 100, maxFileBytes: 100 },
    };

    expect(() => assertCompleteEffectSnapshot(snap, 'rollback')).toThrow(
      /refusing to rollback because byte coverage is UNJUDGED/,
    );
  });
});
