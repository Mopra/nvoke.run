import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, nativeTheme, screen, type BrowserWindow } from 'electron';
import { sleep, waitForLoad } from '../kit';
import { Director } from './director';
import { FLASH, Recorder } from './recorder';
import { SCENES } from './scenes';

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

export async function runFilm(win: BrowserWindow, dir: string, names: string[]): Promise<void> {
  let failed = false;
  mkdirSync(dir, { recursive: true });
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') console.error(`[film] renderer: ${e.message}`);
  });
  try {
    await waitForLoad(win);
    nativeTheme.themeSource = 'light';
    await win.webContents.executeJavaScript(`localStorage.setItem('nvoke.theme', 'light')`);
    // Centered on the primary display, the one the recorder films, which Windows
    // puts at 0,0. At a forced device scale Electron misreports display sizes and
    // maps a window to the screen through whichever display it overlaps most in
    // its own (wrong) layout, while reading a window back stays right. So the
    // script measures the screen, the target sits 2 px left of center (dead
    // center is a tie that maps through the other display), and the window is
    // placed, measured in physical pixels and nudged until it is there.
    const [screenW, screenH] = (process.env['NVOKE_FILM_SCREEN'] ?? '1920x1080').split('x').map(Number) as [number, number];
    const size = { w: FILM_WINDOW.width * FILM_SCALE, h: FILM_WINDOW.height * FILM_SCALE };
    const TASKBAR = 48;
    const target = { x: 2 * Math.floor((screenW - size.w) / 4) - 2, y: 2 * Math.floor((screenH - TASKBAR - size.h) / 4) };
    win.setBounds(FILM_WINDOW);
    for (let i = 0; i < 6; i++) {
      const at = screen.dipToScreenRect(win, win.getBounds());
      const dx = target.x - at.x;
      const dy = target.y - at.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
      if (i === 5) throw new Error(`the window would not sit at ${JSON.stringify(target)}, it is at ${JSON.stringify(at)}`);
      const b = win.getBounds();
      win.setBounds({ ...FILM_WINDOW, x: b.x + Math.round(dx / FILM_SCALE), y: b.y + Math.round(dy / FILM_SCALE) });
      await sleep(100);
    }
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    await sleep(1200);

    for (const name of names) {
      const scene = SCENES[name];
      if (!scene) throw new Error(`no film scene "${name}". Scenes: ${Object.keys(SCENES).join(', ')}`);
      const d = new Director(win, FILM_SCALE);
      await scene.setup(d);
      const recorder = new Recorder(join(dir, `${name}.raw.mp4`));
      await recorder.begin();
      await recorder.sync();
      d.start();
      await scene.act(d);
      const durationMs = d.elapsed;
      await recorder.end();

      const r = screen.dipToScreenRect(win, win.getBounds());
      const s = FILM_SCALE;
      const rect = { x: r.x, y: r.y, w: r.width, h: r.height };
      console.log(`[film] window at ${JSON.stringify(rect)}, dip ${JSON.stringify(win.getBounds())}`);
      writeFileSync(
        join(dir, `${name}.raw.json`),
        JSON.stringify(
          {
            take: name,
            durationMs,
            window: rect,
            flash: { x: FLASH.x * s, y: FLASH.y * s, size: FLASH.size * s },
            ...d.log,
          },
          null,
          1,
        ),
      );
      console.log(`[film] recorded ${name} (${(durationMs / 1000).toFixed(1)} s)`);
    }
  } catch (err) {
    failed = true;
    console.error(`[film] failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
