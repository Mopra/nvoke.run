/**
 * Dark theme tokens for the launch cut's stage. Values copied from
 * packages/theme/theme.css (the `.dark` block); change them there first.
 * The app itself stays in light mode inside its window.
 */
export const dark = {
  background: 'oklch(0.172 0.004 265)',
  /** Deeper than the app's dark background, so the light window and the aura carry the frame. */
  stage: 'oklch(0.13 0.006 265)',
  foreground: 'oklch(0.955 0.003 265)',
  card: 'oklch(0.21 0.005 265 / 0.82)',
  mutedForeground: 'oklch(0.69 0.01 265)',
  border: 'oklch(1 0 0 / 0.085)',
  primary: 'oklch(0.62 0.2 268)',
} as const;
