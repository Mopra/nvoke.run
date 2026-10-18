import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, nativeTheme, type BrowserWindow } from 'electron';
import type { MainContext } from '../context';
import { FILM_SCALE, filmScenes, runFilm } from './film';
import { createKit, sleep, waitForLoad, type CaptureExtras } from './kit';
import { CAPTURE_STEPS } from './shots';

/**
 * Development only. `pnpm --filter @nvoke/desktop capture` (or `--capture[=dir]`
 * on the Electron command line, or NVOKE_CAPTURE=dir) walks every screen in
 * light and dark, writes two PNGs per screen and quits:
 * - `<name>.<theme>.png`: the page as the renderer painted it (capturePage).
 * - `<name>.<theme>.window.png`: the window as it appears on screen, with
 *   the native caption buttons and the window material. Keep it uncovered.
 * Run it with VITE_MOCK=1 so the screens have data.
 *
 * The screens are walked by the steps in `shots.ts`, one file per feature
 * under `shots/`. With `extras` it also runs a real Grab from screen over the
 * results screen: the overlay, then the quick window reading and listing what
 * the OS text engine found (`16-grab-*`).
 */

const DEFAULT_DIR = 'screenshots';

export function captureDirFromArgs(argv: string[], envValue: string | undefined): string | null {
  const flag = argv.find((a) => a === '--capture' || a.startsWith('--capture='));
  const raw = flag ? flag.split('=')[1] || DEFAULT_DIR : envValue || null;
  return raw ? resolve(raw) : null;
}

/** Reads `--capture` and, for a capture run, sets up its throwaway profile. Call before the app is ready. */
export function prepareCapture(): string | null {
  const dir = app.isPackaged ? null : captureDirFromArgs(process.argv, process.env['NVOKE_CAPTURE']);
  // A throwaway profile, so captures never touch the real session or window state.
  if (dir) {
    app.setPath('userData', join(dir, '.profile'));
    // A covered window stops painting on Windows, and capturePage then returns a stale frame.
    app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
    app.commandLine.appendSwitch('disable-renderer-backgrounding');
    app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
    // The film records at twice the pixels, so the camera can move in close (film/).
    if (filmScenes()) app.commandLine.appendSwitch('force-device-scale-factor', String(FILM_SCALE));
  }
  return dir;
}

/** In a capture run, walks the screens once the main window opens. */
export function registerCapture(ctx: MainContext, extras: CaptureExtras): void {
  const dir = ctx.captureDir;
  if (!dir) return;
  const scenes = filmScenes();
  ctx.on('window', (win) => void (scenes ? runFilm(win, dir, scenes, extras) : runCapture(win, dir, extras)));
}

export async function runCapture(win: BrowserWindow, dir: string, extras: CaptureExtras = { quick: null, grab: null }): Promise<void> {
  let failed = false;
  mkdirSync(dir, { recursive: true });
  const kit = createKit(win, dir, extras);

  // A blank shot usually means the renderer died or threw. Say so.
  win.webContents.on('render-process-gone', (_e, details) => console.error('[capture] renderer gone', details));
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[capture] renderer: ${e.message}`);
  });

  try {
    await waitForLoad(win);
    win.setBounds({ width: 1200, height: 780 });
    win.center();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    await sleep(1500);

    for (const theme of ['light', 'dark'] as const) {
      kit.theme = theme;
      // The app's own appearance setting, which also drives nativeTheme.
      nativeTheme.themeSource = theme;
      await kit.js(`localStorage.setItem('nvoke.theme', '${theme}')`);
      for (const step of CAPTURE_STEPS) await step(kit);
    }
  } catch (err) {
    failed = true;
    console.error(`[capture] failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (!failed) console.log(`[capture] wrote screenshots to ${dir}`);
    app.exit(failed ? 1 : 0);
  }
}
