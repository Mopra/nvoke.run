import type { Rectangle } from 'electron';

/** Pure helpers for the quick window, kept apart so they test without Electron. */

export const QUICK_WIDTH = 680;
export const QUICK_MIN_HEIGHT = 96;
export const QUICK_MAX_HEIGHT = 640;

export function clampQuickHeight(height: number): number {
  return Math.min(QUICK_MAX_HEIGHT, Math.max(QUICK_MIN_HEIGHT, Math.ceil(height)));
}

/** Centered horizontally on the display's work area, a fifth of the way down. */
export function quickBounds(workArea: Rectangle, width: number, height: number): Rectangle {
  const w = Math.min(width, workArea.width);
  return {
    x: Math.round(workArea.x + (workArea.width - w) / 2),
    y: Math.round(workArea.y + workArea.height * 0.18),
    width: w,
    height,
  };
}

/** A hash route the renderer knows: `#/`, `#/searches/ID`, `#/new?kind=web`. */
export function isRouteHash(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 && /^#\/[A-Za-z0-9\-_/%?=&.]*$/.test(value);
}

export function hotkeyClashMessage(accelerator: string): string {
  return `${accelerator} is taken by another app. Pick a different shortcut.`;
}
