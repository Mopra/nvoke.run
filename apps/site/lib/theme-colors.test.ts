import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseOklch, parseTheme, REQUIRED_TOKENS } from './theme-colors';

const css = readFileSync(fileURLToPath(new URL('../../../packages/theme/theme.css', import.meta.url)), 'utf8');

describe('parseOklch', () => {
  it('reads opaque and translucent values', () => {
    expect(parseOklch('oklch(1 0 0)')).toBe('rgb(255, 255, 255)');
    expect(parseOklch('oklch(0 0 0 / 0.3)')).toBe('rgba(0, 0, 0, 0.3)');
    expect(parseOklch('oklch(100% 0 0 / 40%)')).toBe('rgba(255, 255, 255, 0.4)');
  });

  it('rejects other formats', () => {
    expect(parseOklch('#fff')).toBeNull();
    expect(parseOklch('oklch(0.5 0.1)')).toBeNull();
  });
});

describe('parseTheme', () => {
  it.each(['light', 'dark'] as const)('has every required token in %s mode', (mode) => {
    const { colors } = parseTheme(css, mode);
    for (const token of REQUIRED_TOKENS) expect(colors[token], token).toMatch(/^rgba?\(/);
  });

  it('follows var() references, skips comments and falls back for missing tokens', () => {
    const theme = parseTheme(
      ':root { /* a: b; */ --a: oklch(1 0 0); --b: var(--a); --c: var(--nope, oklch(0 0 0)); }',
      'light',
    );
    expect(theme.colors['b']).toBe('rgb(255, 255, 255)');
    expect(theme.colors['c']).toBe('rgb(0, 0, 0)');
    expect(theme.get('missing')).toBe('rgb(128, 128, 128)');
  });

  it('lets dark override light and inherit the rest', () => {
    const theme = parseTheme(':root { --a: oklch(1 0 0); --b: oklch(1 0 0); } .dark { --a: oklch(0 0 0); }', 'dark');
    expect(theme.colors['a']).toBe('rgb(0, 0, 0)');
    expect(theme.colors['b']).toBe('rgb(255, 255, 255)');
  });
});
