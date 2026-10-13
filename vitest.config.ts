import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Test against workspace source, never a stale build.
    alias: [
      { find: /^@nvoke\/shared\/crawl$/, replacement: fileURLToPath(new URL('./packages/shared/src/crawl/index.ts', import.meta.url)) },
      { find: /^@nvoke\/shared$/, replacement: fileURLToPath(new URL('./packages/shared/src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts', 'apps/desktop/src/**/*.test.ts', 'apps/site/lib/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    // Starts a Postgres for the server's database tests (embedded, or
    // TEST_DATABASE_URL when set). See apps/server/src/testing/global-setup.ts.
    globalSetup: ['apps/server/src/testing/global-setup.ts'],
    hookTimeout: 60_000,
  },
});
