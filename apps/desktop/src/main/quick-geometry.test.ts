import { describe, expect, it } from 'vitest';
import { clampQuickHeight, isRouteHash, quickBounds } from './quick-geometry';

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
