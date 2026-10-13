import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

/**
 * capturePage rejects with UnknownVizError while the compositor has no fresh
 * frame, which is common right after a reload or when the window first shows.
 * Retrying a few times clears it. If it never does, the display is probably
 * locked or off, so say that in one line instead of a bare stack.
 */
async function capturePage(win: BrowserWindow): Promise<Electron.NativeImage> {
  const tries = 8;
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await win.webContents.capturePage();
    } catch (err) {
      last = err;
      await sleep(1000);
    }
  }
  throw new Error(
    `capturePage failed ${tries} times (${String(last)}). The display is probably locked or off: unlock it, keep the window uncovered and run again.`,
  );
}

async function waitForLoad(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return;
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
}

export async function runCapture(win: BrowserWindow, dir: string): Promise<void> {
  let failed = false;
  mkdirSync(dir, { recursive: true });
  const js = <T = unknown>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true) as Promise<T>;

  async function go(hash: string, settle = 900): Promise<void> {
    await js(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(settle);
  }

  /** Waits until a selector is on the page, for screens that load async. */
  async function until(selector: string, timeout = 8000): Promise<void> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await js<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
      await sleep(100);
    }
    console.warn(`[capture] ${selector} never showed`);
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
    win.webContents.invalidate();
    await sleep(100);
    const page = await capturePage(win);
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
      await go('#/new?kind=domains');
      await shot('06a-new-list-empty', theme);
      // Pasted for real, so the list reads back like it does for a user.
      await js(`document.querySelector('textarea#list')?.focus()`);
      await win.webContents.insertText(
        ['linear.app', 'https://www.figma.com/about', 'hello@raycast.com', 'Pleo', 'Too Good To Go', 'Novo Nordisk A/S', 'vercel.com, supabase.com'].join('\n'),
      );
      await sleep(300);
      await shot('06b-new-list', theme);

      // A CSV dragged over the window, then dropped, as the OS would do it.
      const csvPath = join(tmpdir(), 'nvoke-capture-prospects.csv');
      writeFileSync(
        csvPath,
        ['Company,Website,City', 'Linear,https://linear.app,Remote', 'Pleo,pleo.io,Copenhagen', 'Too Good To Go,,Copenhagen', 'Figma,figma.com,San Francisco'].join('\n'),
      );
      await go('#/');
      try {
        const dbg = win.webContents.debugger;
        if (!dbg.isAttached()) dbg.attach('1.3');
        const data = { items: [], files: [csvPath], dragOperationsMask: 1 };
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: 600, y: 400, data });
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: 600, y: 400, data });
        await sleep(500);
        await shot('06c-file-drop-target', theme);
        await dbg.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: 600, y: 400, data });
        await sleep(900);
        await shot('06d-file-drop-dialog', theme);
        await js(`[...document.querySelectorAll('button')].find((e) => /^Cancel$/.test(e.textContent))?.click()`);
        await sleep(400);
      } catch (err) {
        console.warn(`[capture] file drop failed: ${String(err)}`);
      }

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

        // Select a range of rows, as a click and a shift click would.
        await js(`(() => {
          const rows = document.querySelectorAll('[data-company-row]');
          rows[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          rows[3]?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
        })()`);
        await sleep(600);
        await shot('08b-results-selected', theme);
        await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
        await sleep(300);

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

      // Offline: the app runs on the local copy of searches and companies.
      if (links.done) {
        await js(`localStorage.setItem('nvoke.mock.offline', '1'); location.hash = '#/'`);
        await reload();
        await shot('11c-offline-searches', theme);
        await go(links.done, 1600);
        await shot('11d-offline-results', theme);
        await js(`localStorage.removeItem('nvoke.mock.offline')`);
        await reload();
      }

      await go('#/account');
      // The Claude section waits on main for its setup, so the page is whole once it shows.
      await until('[data-local-mcp]');
      await sleep(300);
      await shot('12-account', theme);
      // Clear of the top fade, so the heading reads.
      await js(`document.querySelector('[data-local-mcp]')?.scrollIntoView({ block: 'start', behavior: 'instant' }); document.querySelector('main')?.scrollBy({ top: -56, behavior: 'instant' })`);
      await sleep(900);
      await shot('12b-claude', theme);
      await js(`document.querySelector('[data-api-keys]')?.scrollIntoView({ block: 'start' })`);
      await sleep(500);
      await shot('13-api-keys', theme);
      await js(`[...document.querySelectorAll('button')].find((e) => /New key/.test(e.textContent))?.click()`);
      await sleep(500);
      await shot('14-new-key', theme);
      // Type for real, so React sees the change like a keystroke.
      await js(`document.querySelector('input[aria-label="Key name"]')?.focus()`);
      await win.webContents.insertText('Zapier');
      await sleep(200);
      await js(`[...document.querySelectorAll('button')].find((e) => /Create key/.test(e.textContent))?.click()`);
      await sleep(900);
      await shot('15-key-created', theme);
      await js(`[...document.querySelectorAll('button')].find((e) => /^Done$/.test(e.textContent))?.click()`);
      await sleep(400);
    }
  } catch (err) {
    failed = true;
    console.error(`[capture] failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (!failed) console.log(`[capture] wrote screenshots to ${dir}`);
    app.exit(failed ? 1 : 0);
  }
}
