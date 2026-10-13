// Screenshots every screen of the real Electron window in light and dark,
// on demo data, into apps/desktop/screenshots (gitignored). Dev only.
//
// ELECTRON_RUN_AS_NODE is removed on purpose: editors and tools that are
// themselves Electron apps can export it, and then electron.exe starts as
// plain Node and exits at once instead of opening a window.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const env = { ...process.env, VITE_MOCK: '1', NVOKE_CAPTURE: resolve(root, 'screenshots') };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('pnpm', ['exec', 'electron-vite', 'dev'], { cwd: root, env, stdio: 'inherit', shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
