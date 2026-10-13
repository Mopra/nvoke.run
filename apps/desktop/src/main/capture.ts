import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, desktopCapturer, nativeTheme, screen, type BrowserWindow } from 'electron';

/**
 * Development only. `pnpm --filter @nvoke/desktop capture` (or `--capture[=dir]`
 * on the Electron command line, or NVOKE_CAPTURE=dir) walks every screen in
 * light and dark, writes two PNGs per screen and quits:
 * - `<name>.<theme>.png`: the page as the renderer painted it (capturePage).
 * - `<name>.<theme>.window.png`: the window as it appears on screen, with
 *   the native caption buttons and the window material. Keep it uncovered.
 * Run it with VITE_MOCK=1 so the screens have data.
 */

const DEFAULT_DIR = 'screenshots';

export function captureDirFromArgs(argv: string[], envValue: string | undefined): string | null {
  const flag = argv.find((a) => a === '--capture' || a.startsWith('--capture='));
  const raw = flag ? flag.split('=')[1] || DEFAULT_DIR : envValue || null;
  return raw ? resolve(raw) : null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitForLoad(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return;
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
}

export async function runCapture(win: BrowserWindow, dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const js = <T = unknown>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true) as Promise<T>;

  async function go(hash: string, settle = 900): Promise<void> {
    await js(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(settle);
  }

  async function reload(): Promise<void> {
    win.webContents.reload();
    await sleep(300);
    await waitForLoad(win);
    await sleep(1400);
  }

  async function shot(name: string, theme: string): Promise<void> {
    // Park the pointer state: nothing hovered.
    await sleep(250);
    const page = await win.webContents.capturePage();
    writeFileSync(join(dir, `${name}.${theme}.png`), page.toPNG());
    try {
      // The screen, cropped to the window: the only capture that includes the
      // window material, since window thumbnails paint clear areas white.
      const bounds = win.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const scale = display.scaleFactor;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: display.size.width * scale, height: display.size.height * scale },
      });
      const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      if (source && !source.thumbnail.isEmpty()) {
        const crop = source.thumbnail.crop({
          x: Math.round((bounds.x - display.bounds.x) * scale),
          y: Math.round((bounds.y - display.bounds.y) * scale),
          width: Math.round(bounds.width * scale),
          height: Math.round(bounds.height * scale),
        });
        writeFileSync(join(dir, `${name}.${theme}.window.png`), crop.toPNG());
      }
    } catch (err) {
      console.warn(`[capture] window capture failed for ${name}: ${String(err)}`);
    }
    console.log(`[capture] ${name}.${theme}`);
  }

  try {
    await waitForLoad(win);
    win.setBounds({ width: 1200, height: 780 });
    win.center();
    win.setAlwaysOnTop(true);
    win.show();
    win.focus();
    await sleep(1500);

    for (const theme of ['light', 'dark'] as const) {
      // The app's own appearance setting, which also drives nativeTheme.
      nativeTheme.themeSource = theme;
      await js(`localStorage.setItem('nvoke.theme', '${theme}')`);

      await js(`localStorage.setItem('nvoke.mock.auth', 'signed-out')`);
      await reload();
      await shot('01-signed-out', theme);

      await js(`localStorage.setItem('nvoke.mock.auth', 'signed-in'); location.hash = '#/'`);
      await reload();
      await shot('02-searches', theme);

      await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: true, bubbles: true }))`);
      await sleep(500);
      await shot('03-command-bar', theme);
      await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
      await sleep(400);

      await go('#/new');
      await shot('04-new-local', theme);
      await go('#/new?kind=web');
      await shot('05-new-web', theme);
      await go('#/new?kind=launches');
      await shot('06-new-launches', theme);

      // A running search and a finished one, read from the searches list.
      await go('#/');
      const links = await js<{ running: string | null; done: string | null }>(`(() => {
        const rows = [...document.querySelectorAll('[data-search-status]')];
        const pick = (s) => rows.find((r) => r.getAttribute('data-search-status') === s)?.getAttribute('href') ?? null;
        return { running: pick('running'), done: pick('done') };
      })()`);
      if (links.running) {
        await go(links.running, 1600);
        await shot('07-results-running', theme);
      }
      if (links.done) {
        await go(links.done, 1600);
        await shot('08-results-done', theme);

        await js(`document.querySelector('[data-copy-email]')?.click()`);
        await sleep(600);
        await shot('09-toast', theme);
        await sleep(3500);

        await js(`(() => {
          const t = document.querySelector('[aria-label="More actions"]');
          t?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
        })()`);
        await sleep(400);
        await shot('10-menu', theme);
        await js(`[...document.querySelectorAll('[role="menuitem"]')].find((e) => /Delete/.test(e.textContent))?.click()`);
        await sleep(500);
        await shot('11-delete-dialog', theme);
        await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
        await sleep(400);
        await js(`[...document.querySelectorAll('button')].find((e) => /Keep it/.test(e.textContent))?.click()`);
        await sleep(400);
        await js(`localStorage.removeItem('nvoke.exportNotice.dismissed')`);
        await js(`[...document.querySelectorAll('button')].find((e) => /Export CSV/.test(e.textContent))?.click()`);
        await sleep(500);
        await shot('11b-export-notice', theme);
        await js(`document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
        await sleep(400);
      }

      await go('#/account');
      await shot('12-account', theme);
      await js(`document.querySelector('[data-api-keys]')?.scrollIntoView({ block: 'start' })`);
      await sleep(500);
      await shot('13-api-keys', theme);
      await js(`[...document.querySelectorAll('button')].find((e) => /New key/.test(e.textContent))?.click()`);
      await sleep(500);
      await shot('14-new-key', theme);
      await js(`(() => {
        const input = document.querySelector('input[aria-label="Key name"]');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(input, 'Zapier');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await sleep(200);
      await js(`[...document.querySelectorAll('button')].find((e) => /Create key/.test(e.textContent))?.click()`);
      await sleep(900);
      await shot('15-key-created', theme);
      await js(`[...document.querySelectorAll('button')].find((e) => /^Done$/.test(e.textContent))?.click()`);
      await sleep(400);
    }
  } catch (err) {
    console.error('[capture] failed', err);
  } finally {
    console.log(`[capture] wrote screenshots to ${dir}`);
    app.exit(0);
  }
}
