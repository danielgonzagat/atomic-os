import { describe, it, expect } from 'vitest';
import {
  resolveSafeTarget,
  isProtectedRelative,
  assertInsideActiveWorkspace,
  bindWorkspaceRoot,
  activeWorkspaceRoot,
  REPO_ROOT,
} from './guard.js';
import * as path from 'node:path';
import * as os from 'node:os';

describe('guard', () => {
  describe('resolveSafeTarget', () => {
    it('resolves a path inside the repo', () => {
      const result = resolveSafeTarget('src/guard.ts');
      expect(result.relPath).toBe('src/guard.ts');
      expect(path.isAbsolute(result.absPath)).toBe(true);
      expect(result.absPath.endsWith(path.join('src', 'guard.ts'))).toBe(true);
      expect(path.isAbsolute(result.repoRoot)).toBe(true);
    });
    it('resolves a different file inside the repo', () => {
      const result = resolveSafeTarget('README.md');
      expect(result.relPath).toBe('README.md');
      expect(path.isAbsolute(result.absPath)).toBe(true);
    });

    it('rejects a path outside the repo', () => {
      expect(() => resolveSafeTarget('/tmp/definitely-not-in-repo.txt')).toThrow();
    });

    it('rejects a path that escapes via .. traversal', () => {
      expect(() => resolveSafeTarget(path.join(os.tmpdir(), 'escape-test.txt'))).toThrow();
    });

    it('rejects protected file CLAUDE.md', () => {
      expect(() => resolveSafeTarget('CLAUDE.md')).toThrow(/governance-protected/);
    });

    it('rejects protected file AGENTS.md', () => {
      expect(() => resolveSafeTarget('AGENTS.md')).toThrow(/governance-protected/);
    });

    it('rejects protected file package.json', () => {
      expect(() => resolveSafeTarget('package.json')).toThrow(/governance-protected/);
    });

    it('rejects protected ops/ prefix files', () => {
      expect(() => resolveSafeTarget('ops/some-config.json')).toThrow(/governance-protected/);
    });

    it('rejects .github/workflows/ prefix', () => {
      expect(() => resolveSafeTarget('.github/workflows/deploy.yml')).toThrow(/governance-protected/);
    });
  });

  describe('isProtectedRelative', () => {
    it('returns the file name for an exact protected match', () => {
      expect(isProtectedRelative('CLAUDE.md')).toBe('CLAUDE.md');
      expect(isProtectedRelative('AGENTS.md')).toBe('AGENTS.md');
      expect(isProtectedRelative('package.json')).toBe('package.json');
      expect(isProtectedRelative('CODEX.md')).toBe('CODEX.md');
      expect(isProtectedRelative('ratchet.json')).toBe('ratchet.json');
      expect(isProtectedRelative('.codacy.yml')).toBe('.codacy.yml');
    });

    it('returns the prefix for a protected directory prefix', () => {
      expect(isProtectedRelative('.github/workflows/deploy.yml')).toBe('.github/workflows/');
      expect(isProtectedRelative('ops/config.json')).toBe('ops/');
      expect(isProtectedRelative('docs/design/sketch.fig')).toBe('docs/design/');
      expect(isProtectedRelative('docs/codacy/report.json')).toBe('docs/codacy/');
    });

    it('returns null for editable governance approvals', () => {
      expect(isProtectedRelative('ops/visual-contract-exceptions.json')).toBeNull();
      expect(isProtectedRelative('ops/test-deletion-approvals.json')).toBeNull();
      expect(isProtectedRelative('ops/skipped-tests-approvals.json')).toBeNull();
    });

    it('returns null for dynamic exception/approval patterns under ops/', () => {
      expect(isProtectedRelative('ops/ci-exceptions.json')).toBeNull();
      expect(isProtectedRelative('ops/security-approvals.json')).toBeNull();
      expect(isProtectedRelative('ops/lint-exceptions.json')).toBeNull();
    });

    it('returns null for unprotected files', () => {
      expect(isProtectedRelative('src/guard.ts')).toBeNull();
      expect(isProtectedRelative('src/trace.ts')).toBeNull();
      expect(isProtectedRelative('README.md')).toBeNull();
      expect(isProtectedRelative('src/server-tools-self.ts')).toBeNull();
    });

    it('returns prefix for husky hooks', () => {
      expect(isProtectedRelative('.husky/commit-msg')).toBe('.husky/commit-msg');
      expect(isProtectedRelative('.husky/pre-push')).toBe('.husky/pre-push');
    });

    it('returns prefix for eslint config files', () => {
      expect(isProtectedRelative('backend/eslint.config.mjs')).toBe('backend/eslint.config.mjs');
      expect(isProtectedRelative('frontend/eslint.config.mjs')).toBe('frontend/eslint.config.mjs');
      expect(isProtectedRelative('worker/eslint.config.mjs')).toBe('worker/eslint.config.mjs');
    });

    it('returns prefix for scripts/ops/check prefix', () => {
      expect(isProtectedRelative('scripts/ops/check/something.ts')).toBe('scripts/ops/check');
    });
  });

  describe('assertInsideActiveWorkspace', () => {
    it('returns silently when no workspace root is configured (candidate null)', () => {
      // Without a workspace root set, assertInsideActiveWorkspace is a no-op
      // because workspaceRootCandidate() returns null.
      const absPath = path.join(os.tmpdir(), 'any-file.txt');
      expect(() => assertInsideActiveWorkspace(absPath)).not.toThrow();
    });

    it('throws when path is outside a bound workspace', () => {
      // First unbind by checking current state and establishing a repo-relative workspace
      // Bind to the REPO_ROOT itself so we can test an outside path
      bindWorkspaceRoot(REPO_ROOT);
      const outsidePath = path.join(os.tmpdir(), 'definitely-outside-workspace.txt');
      expect(() => assertInsideActiveWorkspace(outsidePath)).toThrow(/outside declared workspace root/);
    });

    it('returns silently when path is inside the bound workspace', () => {
      bindWorkspaceRoot(REPO_ROOT);
      const insidePath = path.join(REPO_ROOT, 'src', 'guard.ts');
      expect(() => assertInsideActiveWorkspace(insidePath)).not.toThrow();
    });
  });
});
