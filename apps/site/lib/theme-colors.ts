import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Reads the shadcn tokens from packages/theme/theme.css and converts them to
// rgb() strings. Used where CSS variables do not work, such as the Open Graph
// image, so those images still follow the one theme file.

export type ThemeMode = 'light' | 'dark';

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
  return alpha < 1 ? `rgba(${r}, ${g}, ${bl}, ${alpha})` : `rgb(${r}, ${g}, ${bl})`;
}

function parseBlock(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) return {};
  const body = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/g)) {
    const [, name, l, c, h] = m;
    if (name && l && c && h) out[name] = oklchToRgb(Number(l), Number(c), Number(h));
  }
  return out;
}

export function themeColors(mode: ThemeMode): Record<string, string> {
  const css = readFileSync(join(process.cwd(), 'node_modules', '@nvoke', 'theme', 'theme.css'), 'utf8');
  return parseBlock(css, mode === 'dark' ? '.dark' : ':root');
}
