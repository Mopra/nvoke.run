import { screen, type BrowserWindow } from 'electron';

/**
 * Puts a window at a rectangle in physical pixels. At a forced device scale
 * on a multi monitor desktop Electron misreports display sizes and maps a
 * window to the screen through whichever display it overlaps most in its own
 * (wrong) layout, while reading a window back stays right. So: place, measure
 * in physical pixels, nudge, until it sits there. Synchronous, so it can stand
 * in for a window's own placement.
 */
export function placeAt(win: BrowserWindow, target: { x: number; y: number; w: number; h: number }, scale: number): void {
  const size = { width: Math.round(target.w / scale), height: Math.round(target.h / scale) };
  let b = { ...win.getBounds(), ...size };
  win.setBounds(b);
  for (let i = 0; i < 6; i++) {
    const at = screen.dipToScreenRect(win, win.getBounds());
    const dx = target.x - at.x;
    const dy = target.y - at.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    b = { ...size, x: win.getBounds().x + Math.round(dx / scale), y: win.getBounds().y + Math.round(dy / scale) };
    win.setBounds(b);
  }
  const at = screen.dipToScreenRect(win, win.getBounds());
  throw new Error(`[film] the window would not sit at ${JSON.stringify(target)}, it is at ${JSON.stringify(at)}`);
}

/** Where a window is, in physical pixels. */
export function physical(win: BrowserWindow): { x: number; y: number; w: number; h: number } {
  const r = screen.dipToScreenRect(win, win.getBounds());
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}
