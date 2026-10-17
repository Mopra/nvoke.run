import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Every dependency is a devDependency and gets bundled, so the packaged app
// ships no node_modules. This keeps electron-builder simple under pnpm.
const shared = [
  { find: /^@nvoke\/shared\/crawl$/, replacement: resolve(__dirname, '../../packages/shared/src/crawl/index.ts') },
  { find: /^@nvoke\/shared$/, replacement: resolve(__dirname, '../../packages/shared/src/index.ts') },
];

export default defineConfig({
  main: {
    resolve: { alias: shared },
    build: {
      rollupOptions: {
        // mcp-launcher runs in Node mode for MCP clients (src/main/mcp-launcher.ts).
        // render-bench is the crawl benchmark's desktop pass, built only by scripts/render-bench.mjs.
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'mcp-launcher': resolve(__dirname, 'src/main/mcp-launcher.ts'),
          ...(process.env['NVOKE_RENDER_BENCH'] ? { 'render-bench': resolve(__dirname, 'src/main/local-crawl/bench.ts') } : {}),
        },
      },
    },
  },
  preload: {
    resolve: { alias: shared },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: [...shared, { find: '@', replacement: resolve(__dirname, 'src/renderer/src') }],
    },
    plugins: [react(), tailwindcss()],
  },
});
