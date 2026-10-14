import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { desktopCapturer, screen, type BrowserWindow } from 'electron';
import type { QuickWindow } from '../quick-window';
import type { ScreenGrab } from '../screen-grab';

export interface CaptureExtras {
  quick: QuickWindow | null;
  grab: ScreenGrab | null;
}

/** What a capture step drives the app with. One step per feature, listed in `shots.ts`. */
export interface CaptureKit {
  win: BrowserWindow;
  theme: 'light' | 'dark';
  extras: CaptureExtras;
  /** The running and the finished search's hashes, found on the searches list by the results step. */
  links: { running: string | null; done: string | null };
  sleep(ms: number): Promise<void>;
  js<T = unknown>(code: string): Promise<T>;
  /** Goes to a route hash and lets the screen settle. */
  go(hash: string, settle?: number): Promise<void>;
  /** Waits until a selector is on the page, for screens that load async. */
  until(selector: string, timeout?: number): Promise<void>;
  reload(): Promise<void>;
  /** Writes `<name>.<theme>.png` and `<name>.<theme>.window.png`. */
  shot(name: string, target?: BrowserWindow): Promise<void>;
}

export type CaptureStep = (kit: CaptureKit) => Promise<void>;

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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

export async function waitForLoad(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return;
  await new Promise<void>((r) => win.webContents.once('did-finish-load', () => r()));
}

export function createKit(win: BrowserWindow, dir: string, extras: CaptureExtras): CaptureKit {
  const js = <T = unknown>(code: string): Promise<T> => win.webContents.executeJavaScript(code, true) as Promise<T>;

  const kit: CaptureKit = {
    win,
    theme: 'light',
    extras,
    links: { running: null, done: null },
    sleep,
    js,
    async go(hash, settle = 900) {
      await js(`location.hash = ${JSON.stringify(hash)}`);
      await sleep(settle);
    },
    async until(selector, timeout = 8000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await js<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
        await sleep(100);
      }
      console.warn(`[capture] ${selector} never showed`);
    },
    async reload() {
      win.webContents.reload();
      await sleep(300);
      await waitForLoad(win);
      await sleep(1400);
    },
    async shot(name, target = win) {
      const theme = kit.theme;
      // Park the pointer state: nothing hovered.
      await sleep(250);
      target.webContents.invalidate();
      await sleep(100);
      const page = await capturePage(target);
      writeFileSync(join(dir, `${name}.${theme}.png`), page.toPNG());
      try {
        // The screen, cropped to the window: the only capture that includes the
        // window material, since window thumbnails paint clear areas white.
        const bounds = target.getBounds();
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
    },
  };
  return kit;
}
