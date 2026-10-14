import { screen } from 'electron';
import { waitForLoad, type CaptureStep } from '../kit';

/**
 * A real Grab from screen over the finished search's companies, read by the
 * OS text engine: the overlay, then the quick window reading and listing.
 */
export const grabShots: CaptureStep = async ({ win, links, extras, go, sleep, shot }) => {
  const { grab, quick } = extras;
  if (!links.done || !grab || !quick) return;
  await go(links.done, 1600);
  // The results must be the front window when the screen is captured.
  if (win.isMinimized()) win.restore();
  win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true);
  win.show();
  win.moveTop();
  win.focus();
  await sleep(500);
  // The quick window keeps the theme it loaded with.
  const existing = quick.window;
  if (existing) {
    existing.webContents.reload();
    await sleep(300);
    await waitForLoad(existing);
  }
  await grab.start();
  await sleep(1200);
  const overlay = grab.overlayWindow;
  if (!overlay) {
    console.warn('[capture] grab overlay did not open');
    return;
  }
  await waitForLoad(overlay);
  await sleep(800);
  await shot('16-grab-overlay', overlay);
  // A box over the company rows of the results screen.
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const reading = grab.select({
    x: bounds.x - display.bounds.x + 40,
    y: bounds.y - display.bounds.y + 230,
    width: bounds.width - 80,
    height: bounds.height - 260,
  });
  await sleep(500);
  const panel = quick.window;
  if (panel) await shot('16b-grab-reading', panel);
  await reading;
  await sleep(800);
  if (panel) await shot('16c-grab-list', panel);
  quick.hide(false);
  await sleep(300);
  // Put the main window back in front for the next shots.
  win.setAlwaysOnTop(false);
  win.setAlwaysOnTop(true);
  win.moveTop();
  win.focus();
};
