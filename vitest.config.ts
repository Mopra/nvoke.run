import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against workspace source, never a stale build.
    alias: {
      '@nvoke/shared': fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts', 'apps/site/lib/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
