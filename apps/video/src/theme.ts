/**
 * Light theme tokens for the film. Values copied from packages/theme/theme.css
 * (the `:root` block) so the film matches the apps. Change them there first,
 * then here. Film only extras (aura cores, window shadow) sit at the bottom.
 */
export const theme = {
  background: 'oklch(0.992 0.001 265)',
  foreground: 'oklch(0.2 0.006 265)',
  card: 'oklch(1 0 0)',
  muted: 'oklch(0.955 0.003 265)',
  mutedForeground: 'oklch(0.53 0.01 265)',
  primary: 'oklch(0.57 0.215 268)',
  primaryForeground: 'oklch(0.99 0.004 268)',
  border: 'oklch(0.2 0.01 265 / 0.1)',
  input: 'oklch(0.2 0.01 265 / 0.14)',
  sidebar: 'oklch(0.958 0.003 265)',
  glow: 'oklch(0.6 0.22 268 / 0.38)',
  sheen: 'oklch(0.82 0.12 230)',
  shadowColor: 'oklch(0.25 0.02 265 / 0.08)',
  shadowStrong: 'oklch(0.25 0.02 265 / 0.16)',
  highlight: 'oklch(1 0 0 / 0.7)',
  glass: 'oklch(0.995 0.002 265 / 0.66)',
  glassStrong: 'oklch(0.995 0.002 265 / 0.84)',
  glassHighlight: 'oklch(1 0 0 / 0.95)',
  glassEdge: 'oklch(0.25 0.01 265 / 0.09)',
  aura: 'oklch(0.62 0.2 268 / 0.16)',
  auraSoft: 'oklch(0.75 0.13 230 / 0.12)',
  positive: 'oklch(0.66 0.15 155)',
} as const;

/** The aura's hues without alpha, so the backdrop can set its own strength. */
export const auraColor = (alpha: number) => `oklch(0.62 0.2 268 / ${alpha.toFixed(4)})`;
export const auraSoftColor = (alpha: number) => `oklch(0.75 0.13 230 / ${alpha.toFixed(4)})`;
export const auraDeepColor = (alpha: number) => `oklch(0.55 0.22 285 / ${alpha.toFixed(4)})`;

/** Apple's easeInOut for camera moves and window travel. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
/** A long settle for reveals: fast start, very soft landing. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Exits: gentle start, quick finish. */
export const EASE_IN = [0.55, 0, 0.75, 0.2] as const;
