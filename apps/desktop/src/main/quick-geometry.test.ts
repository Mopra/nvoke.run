import { describe, expect, it } from 'vitest';
import { clampQuickHeight, cropRect, isGrabRect, isRouteHash, quickBounds } from './quick-geometry';

describe('quickBounds', () => {
  it('centers on the display it is given', () => {
    const second = { x: 1920, y: 0, width: 2560, height: 1440 };
    expect(quickBounds(second, 680, 120)).toEqual({ x: 1920 + 940, y: Math.round(1440 * 0.18), width: 680, height: 120 });
  });

  it('shrinks to fit a small display', () => {
    expect(quickBounds({ x: 0, y: 0, width: 500, height: 800 }, 680, 100).width).toBe(500);
  });
});

describe('clampQuickHeight', () => {
  it('keeps the window between a bar and most of a screen', () => {
    expect(clampQuickHeight(10)).toBe(96);
    expect(clampQuickHeight(200.2)).toBe(201);
    expect(clampQuickHeight(5000)).toBe(640);
  });
});

describe('isRouteHash', () => {
  it('only lets app routes through', () => {
    expect(isRouteHash('#/searches/abc-123')).toBe(true);
    expect(isRouteHash('#/new?kind=web')).toBe(true);
    expect(isRouteHash('https://evil.test')).toBe(false);
    expect(isRouteHash('#/<script>')).toBe(false);
    expect(isRouteHash(7)).toBe(false);
  });
});

describe('grab boxes', () => {
  it('scales a box to the frame and clamps it to the display', () => {
    const display = { width: 1000, height: 800 };
    expect(cropRect({ x: 10, y: 20, width: 100, height: 50 }, display, 2)).toEqual({ x: 20, y: 40, width: 200, height: 100 });
    expect(cropRect({ x: 900, y: -10, width: 300, height: 100 }, display, 1.5)).toEqual({ x: 1350, y: 0, width: 150, height: 150 });
  });

  it('treats a click as no box', () => {
    expect(cropRect({ x: 10, y: 10, width: 3, height: 100 }, { width: 1000, height: 800 }, 1)).toBeNull();
  });

  it('checks the shape the overlay sends', () => {
    expect(isGrabRect({ x: 1, y: 2, width: 3, height: 4 })).toBe(true);
    expect(isGrabRect({ x: 1, y: 2, width: Number.NaN, height: 4 })).toBe(false);
    expect(isGrabRect('box')).toBe(false);
  });
});
