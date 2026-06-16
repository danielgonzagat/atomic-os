import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Scope to the real src/ tree; the build-generated compat symlinks
    // (scripts/mcp/atomic-edit -> src) would otherwise discover every test twice.
    include: ['src/**/*.test.ts', 'src/**/*.test.mjs'],
    exclude: ['node_modules', 'dist', 'vendor', 'scripts', 'atomic-edit-evolution'],
    environment: 'node',
    testTimeout: 30000,
  },
});
