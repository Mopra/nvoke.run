import { describe, expect, it } from 'vitest';
import { MIN_SIZE, parseSavedWindow, restorableBounds } from './window-state';

const screen = { x: 0, y: 0, width: 1920, height: 1040 };

describe('parseSavedWindow', () => {
  it('reads bounds, maximized and theme', () => {
    const saved = parseSavedWindow(
      JSON.stringify({ bounds: { x: 10, y: 20, width: 1000, height: 700 }, maximized: true, theme: 'dark' }),
    );
    expect(saved).toEqual({ bounds: { x: 10, y: 20, width: 1000, height: 700 }, maximized: true, theme: 'dark' });
  });

  it('drops malformed fields and survives bad JSON', () => {
    expect(parseSavedWindow(JSON.stringify({ bounds: { x: 'a' }, theme: 'neon' }))).toEqual({
      bounds: undefined,
      maximized: false,
      theme: undefined,
    });
    expect(parseSavedWindow('{nope')).toEqual({});
  });
});

describe('restorableBounds', () => {
  it('keeps a window that is on screen', () => {
    expect(restorableBounds({ x: 100, y: 100, width: 1200, height: 800 }, [screen])).toEqual({
      x: 100,
      y: 100,
      width: 1200,
      height: 800,
    });
  });

  it('forgets a window on a display that is gone', () => {
    expect(restorableBounds({ x: 2500, y: 100, width: 1200, height: 800 }, [screen])).toBeUndefined();
  });

  it('forgets a window whose title bar is above the screen', () => {
    expect(restorableBounds({ x: 100, y: -400, width: 1200, height: 800 }, [screen])).toBeUndefined();
  });

  it('clamps to the minimum size', () => {
    expect(restorableBounds({ x: 0, y: 0, width: 200, height: 100 }, [screen])).toMatchObject(MIN_SIZE);
  });
});
