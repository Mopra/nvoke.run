import { loadFont as loadDoto } from '@remotion/google-fonts/Doto';
import { loadFont as loadSpaceMono } from '@remotion/google-fonts/SpaceMono';

/**
 * The teaser's look, after Nothing's teasers: black, white dots, one accent
 * (the app's signal orange where Nothing spends red), dot matrix type for words that
 * matter, a small mono for the technical labels in the corners.
 */
const doto = loadDoto('normal', { weights: ['700', '900'], subsets: ['latin'] });
const mono = loadSpaceMono('normal', { weights: ['400', '700'], subsets: ['latin'] });

export const type = {
  dots: `${doto.fontFamily}, monospace`,
  mono: `${mono.fontFamily}, ui-monospace, monospace`,
};

export const ink = {
  black: 'oklch(0.08 0 0)',
  white: 'oklch(0.97 0 0)',
  dim: 'oklch(0.32 0 0)',
  faint: 'oklch(0.2 0 0)',
  /** The device's one orange (packages/theme/field.css, primary in the dark finish). */
  signal: 'oklch(0.7 0.21 40)',
  signalGlow: 'oklch(0.7 0.21 40 / 0.55)',
};
