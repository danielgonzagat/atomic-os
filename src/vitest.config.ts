import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Discover the real test tree once. The build-generated compat symlinks
    // (e.g. scripts/mcp/atomic-edit -> src) would otherwise discover every
    // test twice, so the symlinked trees are excluded below.
    include: ['**/*.test.ts', '**/*.test.mjs'],
    exclude: [
      'node_modules',
      'dist',
      'vendor',
      'scripts',
      'atomic-edit-evolution',
      '.positive-byte-sessions',
      '.atomic-build-tmp',
    ],
    environment: 'node',
    testTimeout: 30000,
  },
});
