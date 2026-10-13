import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Reads the color tokens from packages/theme/theme.css and converts them to
// rgb() and rgba() strings. Used where CSS variables do not work, such as the
// Open Graph image, so those images still follow the one theme file.
//
// The parser is deliberately forgiving: it skips comments, accepts oklch()
// with or without alpha (`/ 0.4` or `/ 40%`), lightness as a number or a
// percentage, and tokens that point at other tokens through var(). Anything
// it cannot read is left out, and `ThemePalette.get` then falls back to a
// neutral color instead of handing `undefined` to the renderer.

export type ThemeMode = 'light' | 'dark';

/** Colors the OG image and similar renderers rely on. Tested against theme.css. */
export const REQUIRED_TOKENS = [
  'background',
  'foreground',
  'card',
  'accent',
  'muted-foreground',
  'border',
  'primary',
  'primary-foreground',
  'glow',
  'sheen',
  'chart-1',
  'chart-2',
  'chart-3',
  'destructive',
  'shadow-strong',
  'window-close',
  'window-minimize',
  'window-zoom',
] as const;

export type ThemePalette = {
  /** Every token that parsed, as an rgb() or rgba() string. */
  colors: Record<string, string>;
  /** A token's color, or the fallback (a mid gray) when it is missing. */
  get: (name: string, fallback?: string) => string;
};

const FALLBACK = 'rgb(128, 128, 128)';

function oklchToRgb(l: number, c: number, hDeg: number, alpha = 1): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const [r, g, bl] = linear.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
  const al = Math.min(1, Math.max(0, alpha));
  return al < 1 ? `rgba(${r}, ${g}, ${bl}, ${Number(al.toFixed(3))})` : `rgb(${r}, ${g}, ${bl})`;
}

function num(raw: string, percentScale: number): number | null {
  const s = raw.trim();
  if (s === 'none') return 0;
  const pct = s.endsWith('%');
  const n = Number(pct ? s.slice(0, -1) : s);
  if (!Number.isFinite(n)) return null;
  return pct ? n / percentScale : n;
}

/** Converts one oklch() value to rgb(a). Returns null for anything else. */
export function parseOklch(value: string): string | null {
  const m = /^oklch\(\s*([^)]*)\)$/i.exec(value.trim());
  if (!m?.[1]) return null;
  const [channels = '', alphaPart] = m[1].split('/');
  const parts = channels.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const l = num(parts[0] ?? '', 100);
  const c = num(parts[1] ?? '', 100 / 0.4);
  const h = num((parts[2] ?? '').replace(/deg$/, ''), 1);
  const alpha = alphaPart === undefined ? 1 : num(alphaPart, 100);
  if (l === null || c === null || h === null || alpha === null) return null;
  return oklchToRgb(l, c, h, alpha);
}

/** The declarations of the first rule whose selector is exactly `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (rule[1]?.trim() !== selector) continue;
    for (const decl of (rule[2] ?? '').split(';')) {
      const i = decl.indexOf(':');
      if (i === -1) continue;
      const name = decl.slice(0, i).trim();
      if (name.startsWith('--')) out.set(name.slice(2), decl.slice(i + 1).trim());
    }
  }
  return out;
}

/** Parses the color tokens of one mode. Dark inherits anything it does not set. */
export function parseTheme(css: string, mode: ThemeMode): ThemePalette {
  const raw = declarations(css, ':root');
  if (mode === 'dark') for (const [k, v] of declarations(css, '.dark')) raw.set(k, v);

  const resolve = (value: string, depth = 0): string | null => {
    const ref = /^var\(\s*--([\w-]+)\s*(?:,\s*(.+))?\)$/.exec(value);
    if (ref) {
      const target = ref[1] ? raw.get(ref[1]) : undefined;
      if (target && depth < 8) return resolve(target, depth + 1);
      return ref[2] ? resolve(ref[2].trim(), depth + 1) : null;
    }
    return parseOklch(value);
  };

  const colors: Record<string, string> = {};
  for (const [name, value] of raw) {
    const rgb = resolve(value);
    if (rgb) colors[name] = rgb;
  }
  return { colors, get: (name, fallback = FALLBACK) => colors[name] ?? fallback };
}

function themeCssPath(): string {
  try {
    const require = createRequire(join(process.cwd(), 'package.json'));
    return join(dirname(require.resolve('@nvoke/theme/theme.css')), 'theme.css');
  } catch {
    return join(process.cwd(), 'node_modules', '@nvoke', 'theme', 'theme.css');
  }
}

export function themeColors(mode: ThemeMode): ThemePalette {
  return parseTheme(readFileSync(themeCssPath(), 'utf8'), mode);
}
