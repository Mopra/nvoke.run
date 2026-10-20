import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, nativeTheme, type BrowserWindow } from 'electron';
import { sleep, waitForLoad, type CaptureExtras } from '../kit';
import { Director } from './director';
import { placeAt } from './place';
import { FLASH, Recorder } from './recorder';
import { SCENES } from './scenes';
import { FilmSet } from './set';

/**
 * Development only. Records the product film's scenes (apps/video) from the
 * real window on the film's cast: `pnpm --filter @nvoke/desktop film [scene...]`.
 * Each scene writes `<scene>.raw.mp4` (the whole screen) and `<scene>.raw.json`
 * (where the window sat, the flash, and the director's log) to `dir`, which
 * `scripts/film.mjs` then crops and trims into apps/video/public/takes.
 */

/** The window in DIPs. At device scale 2 the take is 2400x1350, 16:9. */
export const FILM_WINDOW = { width: 1200, height: 675 };
export const FILM_SCALE = 2;

export function filmScenes(): string[] | null {
  const raw = process.env['NVOKE_FILM'];
  if (!raw) return null;
  return raw === 'all' ? Object.keys(SCENES) : raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** The finish the takes are recorded in: `film --dark` sets NVOKE_FILM_THEME. */
function filmTheme(): 'light' | 'dark' {
  return process.env['NVOKE_FILM_THEME'] === 'dark' ? 'dark' : 'light';
}

export async function runFilm(win: BrowserWindow, dir: string, names: string[], extras: CaptureExtras): Promise<void> {
  let failed = false;
  mkdirSync(dir, { recursive: true });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[film] renderer: ${e.message}`);
  });
  const set = new FilmSet(win, frameRect(), extras.quick);
  try {
    await waitForLoad(win);
    const theme = filmTheme();
    nativeTheme.themeSource = theme;
    await win.webContents.executeJavaScript(`localStorage.setItem('nvoke.theme', '${theme}')`);
    // Dark takes sit beside the light ones: journey-dark.mp4 next to journey.mp4.
    const suffix = theme === 'dark' ? '-dark' : '';
    placeAt(win, set.frame, FILM_SCALE);
    // Above other always on top windows too, so nothing covers a take mid scene.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.show();
    win.focus();
    await sleep(1200);

    for (const name of names) {
      const scene = SCENES[name];
      if (!scene) throw new Error(`no film scene "${name}". Scenes: ${Object.keys(SCENES).join(', ')}`);
      const d = new Director(win, FILM_SCALE, set);
      await scene.setup(d);
      const take = `${name}${suffix}`;
      const recorder = new Recorder(join(dir, `${take}.raw.mp4`));
      await recorder.begin();
      await recorder.sync();
      d.start();
      await scene.act(d);
      const durationMs = d.elapsed;
      await recorder.end();
      await set.reset();

      const s = FILM_SCALE;
      writeFileSync(
        join(dir, `${take}.raw.json`),
        JSON.stringify({ take, durationMs, window: set.frame, flash: { x: FLASH.x * s, y: FLASH.y * s, size: FLASH.size * s }, ...d.log }, null, 1),
      );
      console.log(`[film] recorded ${take} (${(durationMs / 1000).toFixed(1)} s)`);
    }
  } catch (err) {
    failed = true;
    console.error(`[film] failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}

/**
 * The frame every take is cropped to, in physical pixels: the window's size,
 * centered on the primary display above the taskbar. The script measures the
 * screen (Electron misreports it at a forced scale), and the frame sits 2 px
 * left of center, since dead center is a tie that maps through the other
 * display (see place.ts).
 */
function frameRect(): { x: number; y: number; w: number; h: number } {
  const [screenW, screenH] = (process.env['NVOKE_FILM_SCREEN'] ?? '1920x1080').split('x').map(Number) as [number, number];
  const w = FILM_WINDOW.width * FILM_SCALE;
  const h = FILM_WINDOW.height * FILM_SCALE;
  const TASKBAR = 48;
  return { x: 2 * Math.floor((screenW - w) / 4) - 2, y: 2 * Math.floor((screenH - TASKBAR - h) / 4), w, h };
}
