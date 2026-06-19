import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readUtf8, atomicWrite, guardSha, sha256 } from './server-helpers-io.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aos-io-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function tmpPath(name: string): string {
  return path.join(tmpDir, name);
}

describe('readUtf8', () => {
  it('reads file content correctly', () => {
    const fp = tmpPath('hello.txt');
    fs.writeFileSync(fp, 'Hello, World!\n', 'utf8');
    expect(readUtf8(fp)).toBe('Hello, World!\n');
  });

  it('reads UTF-8 content with multi-byte characters', () => {
    const fp = tmpPath('unicode.txt');
    fs.writeFileSync(fp, 'café — 🚀', 'utf8');
    expect(readUtf8(fp)).toBe('café — 🚀');
  });

  it('throws when file does not exist', () => {
    expect(() => readUtf8(tmpPath('nope.txt'))).toThrow('file does not exist');
  });

  it('throws when path is a directory, not a regular file', () => {
    const dir = tmpPath('subdir');
    fs.mkdirSync(dir);
    expect(() => readUtf8(dir)).toThrow('not a regular file');
  });

  it('reads an empty file', () => {
    const fp = tmpPath('empty.txt');
    fs.writeFileSync(fp, '', 'utf8');
    expect(readUtf8(fp)).toBe('');
  });
});

describe('guardSha', () => {
  it('does not throw when expected sha matches', () => {
    const content = 'stable content';
    const hash = sha256(content);
    expect(() => guardSha(content, hash)).not.toThrow();
  });

  it('does not throw when expected is undefined', () => {
    expect(() => guardSha('anything', undefined)).not.toThrow();
  });

  it('throws when expected sha does not match', () => {
    const content = 'actual content';
    const wrongHash = sha256('different content');
    expect(() => guardSha(content, wrongHash)).toThrow('sha256 mismatch');
  });

  it('produces deterministic hashes for identical input', () => {
    const a = sha256('hello');
    const b = sha256('hello');
    expect(a).toBe(b);
  });

  it('produces different hashes for different input', () => {
    const a = sha256('hello');
    const b = sha256('world');
    expect(a).not.toBe(b);
  });
});

describe('atomicWrite', () => {
  it('writes a text file and content is correct', () => {
    const fp = tmpPath('output.txt');
    atomicWrite(fp, 'written atomically');
    expect(fs.existsSync(fp)).toBe(true);
    expect(fs.readFileSync(fp, 'utf8')).toBe('written atomically');
  });

  it('overwrites an existing file', () => {
    const fp = tmpPath('overwrite.txt');
    fs.writeFileSync(fp, 'original', 'utf8');
    atomicWrite(fp, 'replaced');
    expect(fs.readFileSync(fp, 'utf8')).toBe('replaced');
  });

  it('writes empty content', () => {
    const fp = tmpPath('empty.txt');
    atomicWrite(fp, '');
    expect(fs.readFileSync(fp, 'utf8')).toBe('');
  });

  it('writes UTF-8 content with special characters', () => {
    const fp = tmpPath('utf8.txt');
    const content = 'café — 🚀\nline 2 — ñ';
    atomicWrite(fp, content);
    expect(fs.readFileSync(fp, 'utf8')).toBe(content);
  });

  it('creates intermediate directories', () => {
    const fp = tmpPath('deep/nested/file.txt');
    atomicWrite(fp, 'deep content');
    expect(fs.existsSync(fp)).toBe(true);
    expect(fs.readFileSync(fp, 'utf8')).toBe('deep content');
  });

  it('writes large content', () => {
    const fp = tmpPath('large.txt');
    const content = 'x'.repeat(100_000);
    atomicWrite(fp, content);
    expect(fs.readFileSync(fp, 'utf8')).toBe(content);
  });
});

describe('write reversibility (atomicWrite + readUtf8 round-trip)', () => {
  it('readUtf8 returns exactly what atomicWrite wrote', () => {
    const fp = tmpPath('roundtrip.txt');
    const content = 'round-trip test: café — 🚀\nline 2\n';
    atomicWrite(fp, content);
    expect(readUtf8(fp)).toBe(content);
  });

  it('round-trips empty content', () => {
    const fp = tmpPath('roundtrip-empty.txt');
    atomicWrite(fp, '');
    expect(readUtf8(fp)).toBe('');
  });

  it('round-trips after overwrite', () => {
    const fp = tmpPath('roundtrip-overwrite.txt');
    atomicWrite(fp, 'first write');
    atomicWrite(fp, 'second write — café');
    expect(readUtf8(fp)).toBe('second write — café');
  });

  it('guardSha passes after write and read back', () => {
    const fp = tmpPath('roundtrip-guard.txt');
    const content = 'content for hash verification';
    atomicWrite(fp, content);
    const readBack = readUtf8(fp);
    const hash = sha256(readBack);
    expect(() => guardSha(readBack, hash)).not.toThrow();
  });

  it('guardSha fails if content was tampered between write and read', () => {
    const fp = tmpPath('tamper.txt');
    const original = 'original content';
    atomicWrite(fp, original);
    const originalHash = sha256(original);
    // Simulate tampering by writing directly (bypassing atomicWrite)
    fs.writeFileSync(fp, 'tampered content', 'utf8');
    const tamperedContent = readUtf8(fp);
    expect(() => guardSha(tamperedContent, originalHash)).toThrow('sha256 mismatch');
  });
});
