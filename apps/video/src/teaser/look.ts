import { loadFont as loadDoto } from '@remotion/google-fonts/Doto';
import { loadFont as loadSpaceMono } from '@remotion/google-fonts/SpaceMono';

/**
 * The teaser's look, after Nothing's teasers: black, white dots, one accent
 * (nvoke's iris where Nothing spends red), dot matrix type for words that
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
  iris: 'oklch(0.66 0.2 268)',
  irisGlow: 'oklch(0.66 0.2 268 / 0.55)',
};
