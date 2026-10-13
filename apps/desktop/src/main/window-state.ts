import { readFileSync, writeFileSync } from 'node:fs';
import type { Rectangle } from 'electron';
import type { ThemeSource } from '../ipc/contract';

/**
 * Window size, position and appearance, kept in userData between launches.
 * Pure helpers here; the BrowserWindow wiring lives in window.ts.
 */
export interface SavedWindow {
  bounds?: Rectangle;
  maximized?: boolean;
  theme?: ThemeSource;
}

export const DEFAULT_SIZE = { width: 1200, height: 780 };
export const MIN_SIZE = { width: 900, height: 600 };

function isRect(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k]));
}

export function isThemeSource(value: unknown): value is ThemeSource {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function parseSavedWindow(raw: string): SavedWindow {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      bounds: isRect(data['bounds']) ? data['bounds'] : undefined,
      maximized: data['maximized'] === true,
      theme: isThemeSource(data['theme']) ? data['theme'] : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Returns saved bounds only if a large enough part of the window is still on
 * one of the current displays (a monitor may have been unplugged), clamped to
 * the minimum size.
 */
export function restorableBounds(saved: Rectangle | undefined, workAreas: Rectangle[]): Rectangle | undefined {
  if (!saved) return undefined;
  const bounds = {
    x: Math.round(saved.x),
    y: Math.round(saved.y),
    width: Math.max(MIN_SIZE.width, Math.round(saved.width)),
    height: Math.max(MIN_SIZE.height, Math.round(saved.height)),
  };
  const visible = workAreas.some((area) => {
    const w = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const h = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    // At least a grabbable strip of the title bar has to be on screen.
    return w >= 160 && h >= 80 && bounds.y >= area.y - 8;
  });
  return visible ? bounds : undefined;
}

export function readSavedWindow(file: string): SavedWindow {
  try {
    return parseSavedWindow(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function writeSavedWindow(file: string, data: SavedWindow): void {
  try {
    writeFileSync(file, JSON.stringify(data));
  } catch {
    // Losing the window position is not worth crashing over.
  }
}
