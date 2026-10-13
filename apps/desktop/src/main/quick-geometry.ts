import type { Rectangle } from 'electron';
import type { GrabRect } from '../ipc/contract';

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

/** Smaller grab boxes are a click, not a drag. */
const MIN_SIDE = 8;

export function isGrabRect(value: unknown): value is GrabRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

/** `rect` (CSS px on a display of `size`) in the pixels of a frame `scale` times larger, clamped to the frame. */
export function cropRect(rect: GrabRect, size: { width: number; height: number }, scale: number): GrabRect | null {
  const x = Math.max(0, Math.min(size.width, rect.x));
  const y = Math.max(0, Math.min(size.height, rect.y));
  const width = Math.min(size.width - x, Math.max(0, rect.width));
  const height = Math.min(size.height - y, Math.max(0, rect.height));
  if (width < MIN_SIDE || height < MIN_SIDE) return null;
  return { x: Math.round(x * scale), y: Math.round(y * scale), width: Math.floor(width * scale), height: Math.floor(height * scale) };
}
