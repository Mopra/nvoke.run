import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Every dependency is a devDependency and gets bundled, so the packaged app
// ships no node_modules. This keeps electron-builder simple under pnpm.
const shared = { '@nvoke/shared': resolve(__dirname, '../../packages/shared/src/index.ts') };

export default defineConfig({
  main: {
    resolve: { alias: shared },
  },
  preload: {
    resolve: { alias: shared },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        ...shared,
        '@': resolve(__dirname, 'src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
